import pytest
from datetime import date, datetime, timedelta

from backend.app.database import SessionLocal
from backend.app.models import Session as SessionRow


def login(client, username, password):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp


def login_admin(client):
    return login(client, "admin", "admin")


def create_student(client, name):
    return client.post("/api/students", json={"name": name})


def surah_id_by_number(client, number):
    resp = client.get("/api/surahs")
    assert resp.status_code == 200
    for surah in resp.json():
        if surah["number"] == number:
            return surah["id"]
    pytest.fail(f"surah {number} not found")


def create_session(client, student_id, kind, surah_id, from_page, to_page, **extra):
    payload = {
        "student_id": student_id,
        "kind": kind,
        "surah_id": surah_id,
        "from_page": from_page,
        "to_page": to_page,
    }
    payload.update(extra)
    return client.post("/api/sessions", json=payload)


def create_juz_session(client, student_id, juz, from_ayah, to_ayah, **extra):
    payload = {
        "student_id": student_id,
        "kind": "new",
        "juz": juz,
        "from_ayah": from_ayah,
        "to_ayah": to_ayah,
    }
    payload.update(extra)
    return client.post("/api/sessions", json=payload)


def test_health_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "app": "Quran Hifz Tracker"}


def test_login_default_admin_sets_cookie_and_me(client):
    resp = login_admin(client)
    assert resp.json()["username"] == "admin"
    assert resp.json()["role"] == "creator"
    assert client.cookies.get("hifz_session")

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == "admin"
    assert body["role"] == "creator"


def test_login_wrong_password_returns_401(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_mobile_login_returns_token_and_bearer_works(client):
    resp = client.post("/api/auth/mobile-login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["username"] == "admin"
    assert len(body["token"]) > 20
    assert "expires_at" in body

    client.cookies.clear()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    students = client.get("/api/students", headers={"Authorization": f"Bearer {body['token']}"})
    assert students.status_code == 200


def test_mobile_login_wrong_password_returns_401(client):
    resp = client.post("/api/auth/mobile-login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_bearer_token_invalid_returns_401(client):
    me = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert me.status_code == 401


def test_unauthenticated_students_returns_401(client):
    resp = client.get("/api/students")
    assert resp.status_code == 401


def test_create_student_and_duplicate_conflict(client):
    login_admin(client)

    resp = create_student(client, "Ahmed")
    assert resp.status_code == 201
    assert resp.json()["name"] == "Ahmed"

    dup = create_student(client, "Ahmed")
    assert dup.status_code == 409


def test_list_surahs_returns_114(client):
    login_admin(client)

    resp = client.get("/api/surahs")
    assert resp.status_code == 200
    surahs = resp.json()
    assert len(surahs) == 114
    assert surahs[0]["number"] == 1
    assert surahs[0]["start_page"] == 1


def test_sessions_and_stats_progress(client):
    login_admin(client)

    student = create_student(client, "Fatima").json()
    yasin = surah_id_by_number(client, 36)

    new_resp = create_session(client, student["id"], "new", yasin, 440, 442)
    assert new_resp.status_code == 201
    assert new_resp.json()["kind"] == "new"
    assert new_resp.json()["juz_from"] == 22
    assert new_resp.json()["juz_to"] == 23
    assert new_resp.json()["ruku_from"] == 381
    assert new_resp.json()["ruku_to"] == 383
    assert new_resp.json()["completed"] is False
    assert new_resp.json()["completed_at"] is None

    rev_resp = create_session(client, student["id"], "revision", yasin, 440, 441)
    assert rev_resp.status_code == 201
    assert rev_resp.json()["kind"] == "revision"
    assert rev_resp.json()["ruku_from"] == 381
    assert rev_resp.json()["ruku_to"] == 382

    # Pending sessions must not count toward progress yet.
    stats = client.get("/api/stats")
    assert stats.status_code == 200
    body = stats.json()

    progress = body["progress"][str(student["id"])]
    assert progress["memorised_pages"] == 0

    recent = {s["kind"]: s for s in body["recent_sessions"]}
    assert set(recent) == {"new", "revision"}
    assert recent["new"]["juz_from"] == 22
    assert recent["new"]["juz_to"] == 23
    assert recent["new"]["ruku_from"] == 381
    assert recent["new"]["ruku_to"] == 383
    assert body["total_sessions"] == 2

    # Completing the new session unlocks its pages.
    done = client.patch(
        f"/api/sessions/{new_resp.json()['id']}/complete", json={"completed": True}
    )
    assert done.status_code == 200
    assert done.json()["completed"] is True
    assert done.json()["completed_at"] is not None

    body = client.get("/api/stats").json()
    progress = body["progress"][str(student["id"])]
    assert progress["memorised_pages"] == 3


def test_juz_ayahs_lists_ayahs_within_juz(client):
    login_admin(client)

    resp = client.get("/api/sessions/juz-ayahs?juz=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_ayah"] == 1
    assert body["to_ayah"] == len(body["ayahs"]) == 148
    first = body["ayahs"][0]
    assert first["local"] == 1
    assert first["surah_number"] == 1
    assert first["surah_name_en"] == "Al-Fatiha"
    assert first["ayah"] == 1
    last = body["ayahs"][-1]
    assert last["local"] == 148
    assert last["surah_number"] == 2
    assert last["ayah"] == 141

    assert client.get("/api/sessions/juz-ayahs?juz=0").status_code == 422
    assert client.get("/api/sessions/juz-ayahs?juz=31").status_code == 422


def test_ayah_meta_resolves_range_to_pages_and_reference(client):
    login_admin(client)

    # Al-Fatiha (juz 1 ayahs 1..7) sits alone on page 1, ruku 1.
    resp = client.get("/api/sessions/ayah-meta?juz=1&from_ayah=1&to_ayah=7")
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_ayah"] == 1
    assert body["to_ayah"] == 7
    assert body["from_page"] == body["to_page"] == 1
    assert body["juz_from"] == body["juz_to"] == 1
    assert body["ruku_from"] == body["ruku_to"] == 1
    assert [s["name_en"] for s in body["surahs"]] == ["Al-Fatiha"]

    # A range crossing a surah boundary lists both surahs as reference.
    resp = client.get("/api/sessions/ayah-meta?juz=1&from_ayah=1&to_ayah=8")
    names = [s["name_en"] for s in resp.json()["surahs"]]
    assert names == ["Al-Fatiha", "Al-Baqara"]

    # Validation.
    assert client.get("/api/sessions/ayah-meta?juz=1&from_ayah=1&to_ayah=149").status_code == 400
    assert client.get("/api/sessions/ayah-meta?juz=1&from_ayah=8&to_ayah=7").status_code == 400


def test_create_session_from_ayah_range(client):
    login_admin(client)
    student = create_student(client, "Ayah Logger").json()

    meta = client.get("/api/sessions/ayah-meta?juz=2&from_ayah=1&to_ayah=1").json()
    assert meta["juz_from"] == 2
    assert meta["ruku_from"] == meta["ruku_to"]
    assert [s["number"] for s in meta["surahs"]] == [2]

    resp = client.post(
        "/api/sessions",
        json={
            "student_id": student["id"],
            "kind": "new",
            "juz": 2,
            "from_ayah": 1,
            "to_ayah": 1,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["juz"] == 2
    assert body["from_ayah"] == 1
    assert body["to_ayah"] == 1
    assert body["juz_from"] == 2
    assert body["juz_to"] == 2
    assert body["surah_name_en"] == "Al-Baqara"

    # Invalid ayah range for the juz is rejected.
    resp = client.post(
        "/api/sessions",
        json={
            "student_id": student["id"],
            "kind": "new",
            "juz": 2,
            "from_ayah": 1,
            "to_ayah": 900,
        },
    )
    assert resp.status_code == 400

    # juz without ayahs is rejected.
    resp = client.post(
        "/api/sessions",
        json={"student_id": student["id"], "kind": "new", "juz": 2},
    )
    assert resp.status_code == 400

    # juz is optional: page-based sessions still work.
    resp = client.post(
        "/api/sessions",
        json={
            "student_id": student["id"],
            "kind": "new",
            "from_page": 440,
            "to_page": 441,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["juz"] is None


def test_complete_unknown_session_returns_404(client):
    login_admin(client)
    resp = client.patch("/api/sessions/9999/complete", json={"completed": True})
    assert resp.status_code == 404


def test_complete_requires_auth(client):
    resp = client.patch("/api/sessions/1/complete", json={"completed": True})
    assert resp.status_code == 401


def link_student_to_user(student_id, username):
    from backend.app.database import SessionLocal
    from backend.app.models import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        user.student_id = student_id
        db.commit()
        return user.id
    finally:
        db.close()


def test_student_can_tick_own_session(client):
    login_admin(client)

    student = create_student(client, "Hafiz").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 442)
    assert created.status_code == 201

    client.post(
        "/api/users",
        json={"name": "Hafiz User", "username": "hafiz1", "password": "hafiz123", "role": "user"},
    )
    link_student_to_user(student["id"], "hafiz1")
    login(client, "hafiz1", "hafiz123")

    resp = client.patch(
        f"/api/sessions/{created.json()['id']}/complete", json={"completed": True}
    )
    assert resp.status_code == 200
    assert resp.json()["completed"] is True

    stats = client.get("/api/stats").json()
    progress = stats["progress"][str(student["id"])]
    assert progress["memorised_pages"] == 3

    # Untick resets progress.
    resp = client.patch(
        f"/api/sessions/{created.json()['id']}/complete", json={"completed": False}
    )
    assert resp.status_code == 200
    assert resp.json()["completed"] is False
    assert resp.json()["completed_at"] is None
    stats = client.get("/api/stats").json()
    assert stats["progress"][str(student["id"])]["memorised_pages"] == 0


def test_student_cannot_tick_someone_elses_session(client):
    login_admin(client)

    own = create_student(client, "Mine").json()
    other = create_student(client, "Theirs").json()
    yasin = surah_id_by_number(client, 36)
    other_session = create_session(client, other["id"], "new", yasin, 440, 441)
    assert other_session.status_code == 201

    client.post(
        "/api/users",
        json={"name": "Mine User", "username": "mine1", "password": "mine123", "role": "user"},
    )
    link_student_to_user(own["id"], "mine1")
    login(client, "mine1", "mine123")

    resp = client.patch(
        f"/api/sessions/{other_session.json()['id']}/complete", json={"completed": True}
    )
    assert resp.status_code == 403


def test_student_stats_count_only_own_sessions(client):
    login_admin(client)

    own = create_student(client, "Counter").json()
    other = create_student(client, "OtherCounter").json()
    yasin = surah_id_by_number(client, 36)
    for _ in range(3):
        create_session(client, own["id"], "new", yasin, 440, 441)
    for _ in range(5):
        create_session(client, other["id"], "new", yasin, 440, 441)

    admin_stats = client.get("/api/stats").json()
    assert admin_stats["total_sessions"] == 8

    client.post(
        "/api/users",
        json={"name": "Counter User", "username": "counter1", "password": "counter123", "role": "user"},
    )
    link_student_to_user(own["id"], "counter1")
    login(client, "counter1", "counter123")

    stats = client.get("/api/stats").json()
    assert stats["total_sessions"] == 3
    assert stats["today_activity"] == 3
    assert len(stats["students"]) == 1
    assert stats["students"][0]["id"] == own["id"]


def test_admin_can_tick_any_session(client):
    login_admin(client)

    student = create_student(client, "Anyone").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 442)

    resp = client.patch(
        f"/api/sessions/{created.json()['id']}/complete", json={"completed": True}
    )
    assert resp.status_code == 200
    assert resp.json()["completed"] is True


# ---- ratings & feedback --------------------------------------------------


def test_rating_rules(client):
    login_admin(client)

    student = create_student(client, "Rater").json()
    yasin = surah_id_by_number(client, 36)
    pending = create_session(client, student["id"], "new", yasin, 440, 441)
    done = create_session(client, student["id"], "new", yasin, 442, 442)
    client.patch(f"/api/sessions/{done.json()['id']}/complete", json={"completed": True})

    # Incomplete sessions cannot be rated.
    resp = client.patch(
        f"/api/sessions/{pending.json()['id']}/rating",
        json={"rating": 5, "feedback": "Great"},
    )
    assert resp.status_code == 400

    # Rate the completed one.
    resp = client.patch(
        f"/api/sessions/{done.json()['id']}/rating",
        json={"rating": 4, "feedback": "Good"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rating"] == 4
    assert body["feedback"] == "Good"
    assert body["rated_by_name"] == "Admin"

    # Stars must be 1..5.
    assert client.patch(f"/api/sessions/{done.json()['id']}/rating", json={"rating": 0}).status_code == 422
    assert client.patch(f"/api/sessions/{done.json()['id']}/rating", json={"rating": 6}).status_code == 422

    # Overwrite and clear.
    resp = client.patch(
        f"/api/sessions/{done.json()['id']}/rating",
        json={"rating": 5, "feedback": "Excellent"},
    )
    assert resp.json()["rating"] == 5
    resp = client.patch(f"/api/sessions/{done.json()['id']}/rating", json={"rating": None})
    assert resp.json()["rating"] is None
    assert resp.json()["feedback"] == "Excellent"


def test_rating_unknown_session_returns_404(client):
    login_admin(client)
    resp = client.patch("/api/sessions/9999/rating", json={"rating": 5})
    assert resp.status_code == 404


def test_rateable_sessions_queue(client):
    login_admin(client)
    student = create_student(client, "Queue").json()
    yasin = surah_id_by_number(client, 36)
    today = date.today()

    # Older session dated today, completed first; newer session dated earlier,
    # completed second. The queue must sort by completion time, not session date.
    s_old = create_session(client, student["id"], "new", yasin, 440, 440, date=today.isoformat())
    s_new = create_session(
        client, student["id"], "new", yasin, 441, 442,
        date=(today - timedelta(days=5)).isoformat(),
    )
    client.patch(f"/api/sessions/{s_old.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s_new.json()['id']}/complete", json={"completed": True})

    stats = client.get("/api/stats").json()
    queue = stats["rateable_sessions"]
    assert [s["id"] for s in queue] == [s_new.json()["id"], s_old.json()["id"]]

    # Rating a session removes it from the queue.
    client.patch(f"/api/sessions/{s_new.json()['id']}/rating", json={"rating": 5})
    queue = client.get("/api/stats").json()["rateable_sessions"]
    assert [s["id"] for s in queue] == [s_old.json()["id"]]

    # Uncompleting a session also removes it from the queue.
    client.patch(f"/api/sessions/{s_old.json()['id']}/complete", json={"completed": False})
    assert client.get("/api/stats").json()["rateable_sessions"] == []


def test_student_gets_empty_rateable_queue(client):
    login_admin(client)
    student = create_student(client, "QueueUser").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 441)
    client.patch(f"/api/sessions/{created.json()['id']}/complete", json={"completed": True})
    client.post(
        "/api/users",
        json={"name": "Queue User", "username": "queueuser", "password": "queue123", "role": "user"},
    )
    link_student_to_user(student["id"], "queueuser")
    login(client, "queueuser", "queue123")

    stats = client.get("/api/stats").json()
    assert stats["rateable_sessions"] == []


def test_student_cannot_rate(client):
    login_admin(client)
    student = create_student(client, "Rated").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 441)
    client.patch(f"/api/sessions/{created.json()['id']}/complete", json={"completed": True})
    client.post(
        "/api/users",
        json={"name": "Rated User", "username": "rated1", "password": "rated123", "role": "user"},
    )
    link_student_to_user(student["id"], "rated1")
    login(client, "rated1", "rated123")

    resp = client.patch(f"/api/sessions/{created.json()['id']}/rating", json={"rating": 5})
    assert resp.status_code == 403


def test_juz_summary_avg_rating_and_duration(client):
    login_admin(client)
    student = create_student(client, "Summary").json()
    yasin = surah_id_by_number(client, 36)
    today = date.today()

    s1 = create_session(
        client, student["id"], "new", yasin, 440, 440,
        date=(today - timedelta(days=10)).isoformat(),
    )
    s2 = create_session(
        client, student["id"], "new", yasin, 441, 442, date=today.isoformat(),
    )
    client.patch(f"/api/sessions/{s1.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s2.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s1.json()['id']}/rating", json={"rating": 4})
    client.patch(f"/api/sessions/{s2.json()['id']}/rating", json={"rating": 5})

    stats = client.get("/api/stats").json()
    summary = stats["juz_summary"][str(student["id"])]
    assert len(summary) == 1
    juz = summary[0]
    assert juz["juz"] == 22
    # 440-441 are in juz 22; 442 spills into juz 23 and is not double-counted.
    assert juz["pages_memorised"] == 2
    assert juz["total_pages"] == juz["page_to"] - juz["page_from"] + 1
    assert juz["complete"] is False
    assert juz["sessions"] == 2
    assert juz["rated_sessions"] == 2
    assert juz["avg_rating"] == 4.5
    assert juz["duration_days"] == 10


def test_student_sees_rating_and_juz_summary(client):
    login_admin(client)
    student = create_student(client, "Reader2").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 442)
    client.patch(f"/api/sessions/{created.json()['id']}/complete", json={"completed": True})
    client.patch(
        f"/api/sessions/{created.json()['id']}/rating",
        json={"rating": 5, "feedback": "Mashallah"},
    )
    client.post(
        "/api/users",
        json={"name": "Reader2", "username": "reader2", "password": "read1234", "role": "user"},
    )
    link_student_to_user(student["id"], "reader2")
    login(client, "reader2", "read1234")

    stats = client.get("/api/stats").json()
    session = stats["recent_sessions"][0]
    assert session["rating"] == 5
    assert session["feedback"] == "Mashallah"
    assert session["rated_by_name"] == "Admin"

    rated = stats["rated_sessions"]
    assert [s["id"] for s in rated] == [created.json()["id"]]
    assert rated[0]["rating"] == 5
    assert rated[0]["feedback"] == "Mashallah"

    summary = stats["juz_summary"][str(student["id"])]
    assert len(summary) == 1
    assert summary[0]["avg_rating"] == 5.0


def test_pages_outside_valid_range_returns_400(client):
    login_admin(client)

    student = create_student(client, "Zaynab").json()
    yasin = surah_id_by_number(client, 36)

    resp = create_session(client, student["id"], "new", yasin, 0, 102)
    assert resp.status_code == 400

    resp = create_session(client, student["id"], "new", yasin, 100, 605)
    assert resp.status_code == 400


def test_from_page_greater_than_to_page_returns_400(client):
    login_admin(client)

    student = create_student(client, "Yusuf").json()
    yasin = surah_id_by_number(client, 36)

    resp = create_session(client, student["id"], "new", yasin, 442, 440)
    assert resp.status_code == 400


def test_section_meta_returns_juz_and_ruku(client):
    login_admin(client)
    yasin = surah_id_by_number(client, 36)

    resp = client.get(
        f"/api/sessions/section-meta?surah_id={yasin}&from_page=440&to_page=442"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"juz_from": 22, "juz_to": 23, "ruku_from": 381, "ruku_to": 383}

    resp = client.get(
        f"/api/sessions/section-meta?surah_id={yasin}&from_page=440&to_page=441"
    )
    assert resp.json()["ruku_from"] == 381
    assert resp.json()["ruku_to"] == 382


def test_section_meta_rejects_out_of_range_pages(client):
    login_admin(client)
    yasin = surah_id_by_number(client, 36)

    resp = client.get(
        f"/api/sessions/section-meta?surah_id={yasin}&from_page=100&to_page=102"
    )
    assert resp.status_code == 400

    resp = client.get(
        f"/api/sessions/section-meta?surah_id={yasin}&from_page=442&to_page=440"
    )
    assert resp.status_code == 400


def test_non_admin_can_read_but_not_create_sessions(client):
    login_admin(client)

    created = client.post(
        "/api/users",
        json={"name": "Reader", "username": "reader1", "password": "reader1", "role": "user"},
    )
    assert created.status_code == 201

    login(client, "reader1", "reader1")

    students = client.get("/api/students")
    assert students.status_code == 200

    stats = client.get("/api/stats")
    assert stats.status_code == 200

    yasin = surah_id_by_number(client, 36)
    resp = create_session(client, 1, "new", yasin, 440, 441)
    assert resp.status_code == 403


def test_settings_defaults_patch_and_permission(client):
    login_admin(client)

    settings = client.get("/api/settings")
    assert settings.status_code == 200
    assert settings.json() == {
        "telegram_daily_time": "18:00",
        "alexa_enabled": True,
        "alexa_weekday_time": "16:00",
        "alexa_weekend_time": "11:00",
        "revision_lookback_pages": 3,
    }

    patched = client.patch("/api/settings", json={"alexa_weekday_time": "15:30"})
    assert patched.status_code == 200
    assert patched.json()["alexa_weekday_time"] == "15:30"

    client.post(
        "/api/users",
        json={"name": "Peon", "username": "peon1", "password": "peon123", "role": "user"},
    )
    login(client, "peon1", "peon123")

    denied = client.patch("/api/settings", json={"alexa_weekday_time": "09:00"})
    assert denied.status_code == 403
    denied_get = client.get("/api/settings")
    assert denied_get.status_code == 403

    # Settings are creator-only: a plain admin is denied too.
    login_admin(client)
    client.post(
        "/api/users",
        json={"name": "Helper", "username": "helper1", "password": "helper123", "role": "admin"},
    )
    login(client, "helper1", "helper123")
    assert client.get("/api/settings").status_code == 403
    assert client.patch("/api/settings", json={"alexa_weekday_time": "09:00"}).status_code == 403


def set_completed_at(session_id, when):
    db = SessionLocal()
    try:
        row = db.get(SessionRow, session_id)
        row.completed_at = when
        db.commit()
    finally:
        db.close()


def test_history_aggregates_monthly_stars_and_juz(client):
    login_admin(client)
    student = create_student(client, "Historian").json()
    yasin = surah_id_by_number(client, 36)

    s1 = create_session(
        client, student["id"], "new", yasin, 1, 5, date="2026-02-01"
    )
    s2 = create_session(
        client, student["id"], "new", yasin, 6, 8, date="2026-03-01"
    )
    s3 = client.post(
        "/api/sessions",
        json={
            "student_id": student["id"],
            "kind": "new",
            "juz": 1,
            "from_ayah": 1,
            "to_ayah": 7,
            "date": "2026-03-05",
        },
    )
    assert s3.status_code == 201
    for s in (s1, s2, s3):
        client.patch(f"/api/sessions/{s.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s1.json()['id']}/rating", json={"rating": 4})
    client.patch(f"/api/sessions/{s2.json()['id']}/rating", json={"rating": 5})
    client.patch(f"/api/sessions/{s3.json()['id']}/rating", json={"rating": 3})
    set_completed_at(s1.json()["id"], datetime(2026, 2, 15, 12, 0))
    set_completed_at(s2.json()["id"], datetime(2026, 3, 10, 12, 0))
    set_completed_at(s3.json()["id"], datetime(2026, 3, 20, 12, 0))

    body = client.get(f"/api/stats/history?student_id={student['id']}").json()

    summary = body["summary"]
    assert summary["student_name"] == "Historian"
    assert summary["season_start"] == "2026-02-01"
    assert summary["first_session"] == "2026-02-15"
    assert summary["last_session"] == "2026-03-20"
    assert summary["total_sessions"] == 3
    assert summary["completed_sessions"] == 3
    assert summary["rated_sessions"] == 3
    assert summary["total_stars"] == 12
    assert summary["avg_rating"] == 4.0
    assert summary["pages_memorised"] == 9
    assert summary["ayahs_memorised"] == 7

    months = body["by_month"]
    assert [m["month"] for m in months] == ["2026-02", "2026-03"]
    assert months[0]["sessions"] == 1
    assert months[0]["pages"] == 5
    assert months[0]["stars"] == 4
    assert months[0]["avg_rating"] == 4.0
    assert months[1]["sessions"] == 2
    assert months[1]["pages"] == 4
    assert months[1]["ayahs"] == 7
    assert months[1]["stars"] == 8
    assert months[1]["avg_rating"] == 4.0

    juzs = body["by_juz"]
    assert [j["juz"] for j in juzs] == [1]
    assert juzs[0]["sessions"] == 3
    assert juzs[0]["rated_sessions"] == 3
    assert juzs[0]["avg_rating"] == 4.0
    assert juzs[0]["pages_memorised"] == 8
    assert juzs[0]["duration_days"] == 47
    assert summary["juzs_completed"] == 0


def test_history_filter_by_juz(client):
    login_admin(client)
    student = create_student(client, "Juz Filter").json()

    def juz_session(juz, date):
        r = client.post(
            "/api/sessions",
            json={
                "student_id": student["id"],
                "kind": "new",
                "juz": juz,
                "from_ayah": 1,
                "to_ayah": 7,
                "date": date,
            },
        )
        assert r.status_code == 201
        return r.json()

    s1 = juz_session(1, "2026-02-01")
    s2 = juz_session(1, "2026-02-05")
    s3 = juz_session(2, "2026-02-10")
    for s in (s1, s2, s3):
        client.patch(f"/api/sessions/{s['id']}/complete", json={"completed": True})
        set_completed_at(s["id"], datetime(2026, 2, 15, 12, 0))

    all_body = client.get(f"/api/stats/history?student_id={student['id']}").json()
    assert all_body["summary"]["total_sessions"] == 3
    assert all_body["summary"]["completed_sessions"] == 3

    juz1 = client.get(f"/api/stats/history?student_id={student['id']}&juz=1").json()
    assert juz1["summary"]["total_sessions"] == 2
    assert juz1["summary"]["completed_sessions"] == 2
    assert all(s["juz"] == 1 for s in juz1["sessions"])
    assert [j["juz"] for j in juz1["by_juz"]] == [1]
    assert juz1["by_juz"][0]["sessions"] == 2

    juz2 = client.get(f"/api/stats/history?student_id={student['id']}&juz=2").json()
    assert juz2["summary"]["total_sessions"] == 1
    assert [s["juz"] for s in juz2["sessions"]] == [2]


def test_history_filter_by_rating(client):
    login_admin(client)
    student = create_student(client, "Rating Filter").json()
    yasin = surah_id_by_number(client, 36)

    s1 = create_session(client, student["id"], "new", yasin, 1, 5, date="2026-02-01").json()
    s2 = create_session(client, student["id"], "new", yasin, 6, 8, date="2026-02-02").json()
    s3 = create_session(client, student["id"], "new", yasin, 9, 10, date="2026-02-03").json()
    for s in (s1, s2, s3):
        client.patch(f"/api/sessions/{s['id']}/complete", json={"completed": True})
        set_completed_at(s["id"], datetime(2026, 2, 15, 12, 0))
    client.patch(f"/api/sessions/{s1['id']}/rating", json={"rating": 4})
    client.patch(f"/api/sessions/{s2['id']}/rating", json={"rating": 5})

    four = client.get(f"/api/stats/history?student_id={student['id']}&rating=4").json()
    assert four["summary"]["completed_sessions"] == 1
    assert len(four["sessions"]) == 1
    assert four["sessions"][0]["rating"] == 4

    unrated = client.get(f"/api/stats/history?student_id={student['id']}&rating=-1").json()
    assert unrated["summary"]["completed_sessions"] == 1
    assert unrated["sessions"][0]["rating"] is None


def test_history_filter_validation(client):
    login_admin(client)
    student = create_student(client, "Filter Valid").json()
    resp = client.get(f"/api/stats/history?student_id={student['id']}&juz=31")
    assert resp.status_code == 422
    resp = client.get(f"/api/stats/history?student_id={student['id']}&rating=6")
    assert resp.status_code == 422


def test_history_season_starts_at_first_session(client):
    login_admin(client)
    student = create_student(client, "Seasonal").json()
    yasin = surah_id_by_number(client, 36)

    s1 = create_session(
        client, student["id"], "new", yasin, 1, 5, date="2025-12-01"
    )
    s2 = create_session(
        client, student["id"], "new", yasin, 6, 8, date="2026-03-01"
    )
    client.patch(f"/api/sessions/{s1.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s2.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s1.json()['id']}/rating", json={"rating": 5})
    client.patch(f"/api/sessions/{s2.json()['id']}/rating", json={"rating": 2})
    set_completed_at(s1.json()["id"], datetime(2025, 12, 20, 12, 0))
    set_completed_at(s2.json()["id"], datetime(2026, 3, 10, 12, 0))

    body = client.get(f"/api/stats/history?student_id={student['id']}").json()
    summary = body["summary"]
    assert summary["season_start"] == "2025-12-01"
    assert summary["total_sessions"] == 2
    assert summary["completed_sessions"] == 2
    assert summary["total_stars"] == 7
    assert [m["month"] for m in body["by_month"]] == ["2025-12", "2026-03"]


def test_history_student_only_sees_own(client):
    login_admin(client)
    own = create_student(client, "Owner").json()
    other = create_student(client, "Other").json()
    yasin = surah_id_by_number(client, 36)
    for s in (own, other):
        c = create_session(client, s["id"], "new", yasin, 440, 441)
        client.patch(f"/api/sessions/{c.json()['id']}/complete", json={"completed": True})
        client.patch(f"/api/sessions/{c.json()['id']}/rating", json={"rating": 5})
    client.post(
        "/api/users",
        json={"name": "Owner User", "username": "ownuser", "password": "own12345", "role": "user"},
    )
    link_student_to_user(own["id"], "ownuser")
    login(client, "ownuser", "own12345")

    body = client.get(f"/api/stats/history?student_id={other['id']}").json()
    assert body["summary"]["student_name"] == "Owner"

    body = client.get("/api/stats/history").json()
    assert body["summary"]["student_name"] == "Owner"

    login_admin(client)
    client.post(
        "/api/users",
        json={"name": "Orphan", "username": "orphan1", "password": "orphan123", "role": "user"},
    )
    login(client, "orphan1", "orphan123")
    assert client.get("/api/stats/history").status_code == 403


def test_history_requires_student_and_valid_student(client):
    login_admin(client)
    assert client.get("/api/stats/history").status_code == 400
    assert client.get("/api/stats/history?student_id=9999").status_code == 404


def test_history_drill_down_filters(client):
    login_admin(client)
    student = create_student(client, "Driller").json()
    yasin = surah_id_by_number(client, 36)

    s1 = client.post(
        "/api/sessions",
        json={
            "student_id": student["id"],
            "kind": "new",
            "juz": 1,
            "from_ayah": 1,
            "to_ayah": 7,
            "date": "2026-02-01",
        },
    )
    s2 = create_session(client, student["id"], "new", yasin, 6, 8, date="2026-03-01")
    s3 = create_session(client, student["id"], "revision", yasin, 1, 5, date="2026-03-02")
    for s in (s1, s2, s3):
        client.patch(f"/api/sessions/{s.json()['id']}/complete", json={"completed": True})
    client.patch(f"/api/sessions/{s1.json()['id']}/rating", json={"rating": 4})
    client.patch(f"/api/sessions/{s2.json()['id']}/rating", json={"rating": 5})
    set_completed_at(s1.json()["id"], datetime(2026, 2, 15, 12, 0))
    set_completed_at(s2.json()["id"], datetime(2026, 3, 10, 12, 0))
    set_completed_at(s3.json()["id"], datetime(2026, 3, 20, 12, 0))

    base = client.get(f"/api/stats/history?student_id={student['id']}").json()
    assert [s["rating"] for s in base["by_stars"]] == [5, 4, None]
    assert [s["sessions"] for s in base["by_stars"]] == [1, 1, 1]
    assert len(base["sessions"]) == 3
    assert base["sessions"][0]["student_name"] == "Driller"

    revision = client.get(
        f"/api/stats/history?student_id={student['id']}&kind=revision"
    ).json()
    assert [m["month"] for m in revision["by_month"]] == ["2026-03"]
    assert len(revision["sessions"]) == 1
    assert revision["sessions"][0]["id"] == s3.json()["id"]
    assert revision["by_stars"][0]["rating"] is None
    assert revision["summary"]["total_sessions"] == 1

    month_filter = client.get(
        f"/api/stats/history?student_id={student['id']}&from_month=2026-03"
    ).json()
    assert [m["month"] for m in month_filter["by_month"]] == ["2026-03"]
    assert sorted(s["id"] for s in month_filter["sessions"]) == sorted(
        [s2.json()["id"], s3.json()["id"]]
    )

    assert client.get(
        f"/api/stats/history?student_id={student['id']}&from_month=2026/03"
    ).status_code == 400


def test_partial_completion_validation(client):
    login_admin(client)
    student = create_student(client, "Partial").json()
    created = create_juz_session(client, student["id"], 1, 1, 10)
    sid = created.json()["id"]

    no_note = client.patch(
        f"/api/sessions/{sid}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 1,
            "partial_to_ayah": 8,
        },
    )
    assert no_note.status_code == 400

    no_range = client.patch(
        f"/api/sessions/{sid}/complete",
        json={"completed": True, "completion": "partial", "partial_note": "Ran out of time"},
    )
    assert no_range.status_code == 400

    bad_range = client.patch(
        f"/api/sessions/{sid}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 9,
            "partial_to_ayah": 11,
            "partial_note": "Ran out of time",
        },
    )
    assert bad_range.status_code == 400

    partial = client.patch(
        f"/api/sessions/{sid}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 1,
            "partial_to_ayah": 8,
            "partial_note": "Could not finish the last two",
        },
    )
    assert partial.status_code == 200
    body = partial.json()
    assert body["completed"] is True
    assert body["completion"] == "partial"
    assert body["partial_from_ayah"] == 1
    assert body["partial_to_ayah"] == 8
    assert body["partial_note"] == "Could not finish the last two"

    full = client.patch(
        f"/api/sessions/{sid}/complete",
        json={"completed": True, "completion": "full"},
    )
    assert full.status_code == 200
    body = full.json()
    assert body["completion"] == "full"
    assert body["partial_from_ayah"] is None
    assert body["partial_to_ayah"] is None
    assert body["partial_note"] is None

    reverted = client.patch(f"/api/sessions/{sid}/complete", json={"completed": False})
    assert reverted.status_code == 200
    body = reverted.json()
    assert body["completed"] is False
    assert body["completion"] is None
    assert body["completed_at"] is None


def test_partial_rejected_for_page_sessions(client):
    login_admin(client)
    student = create_student(client, "OldSchool").json()
    yasin = surah_id_by_number(client, 36)
    created = create_session(client, student["id"], "new", yasin, 440, 442)
    resp = client.patch(
        f"/api/sessions/{created.json()['id']}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 1,
            "partial_to_ayah": 2,
            "partial_note": "Ran out of time",
        },
    )
    assert resp.status_code == 400
    assert "juz + ayah" in resp.json()["detail"]


def test_partial_counts_only_done_ayahs(client):
    login_admin(client)
    student = create_student(client, "PartialCounter").json()
    s1 = create_juz_session(client, student["id"], 1, 1, 10)
    s2 = create_juz_session(client, student["id"], 2, 1, 10)
    client.patch(
        f"/api/sessions/{s1.json()['id']}/complete",
        json={"completed": True, "completion": "full"},
    )
    client.patch(
        f"/api/sessions/{s2.json()['id']}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 1,
            "partial_to_ayah": 8,
            "partial_note": "Only did eight",
        },
    )

    stats = client.get("/api/stats").json()
    progress = stats["progress"][str(student["id"])]

    history = client.get(f"/api/stats/history?student_id={student['id']}").json()
    summary = history["summary"]
    assert summary["ayahs_memorised"] == 18
    assert summary["completed_sessions"] == 2
    assert len(history["sessions"]) == 2
    partial_row = next(s for s in history["sessions"] if s["juz"] == 2)
    assert partial_row["completion"] == "partial"
    assert partial_row["partial_note"] == "Only did eight"
    assert partial_row["partial_to_ayah"] == 8

    full_row = next(s for s in history["sessions"] if s["juz"] == 1)
    assert full_row["completion"] == "full"

    # Partial credits strictly fewer pages than doing the whole assignment.
    client.patch(
        f"/api/sessions/{s2.json()['id']}/complete",
        json={"completed": True, "completion": "full"},
    )
    full_progress = client.get("/api/stats").json()["progress"][str(student["id"])]
    assert progress["memorised_pages"] < full_progress["memorised_pages"]

    juz2 = next(j for j in client.get("/api/stats").json()["juz_summary"][str(student["id"])] if j["juz"] == 2)
    assert juz2["sessions"] == 1
    assert juz2["complete"] is False


def test_student_marks_own_session_partial(client):
    login_admin(client)
    student = create_student(client, "SelfPartial").json()
    other = create_student(client, "Other").json()
    created = create_juz_session(client, student["id"], 1, 1, 5)
    other_session = create_juz_session(client, other["id"], 1, 1, 5)
    client.post(
        "/api/users",
        json={"name": "Self", "username": "self1", "password": "self123", "role": "user"},
    )
    link_student_to_user(student["id"], "self1")
    login(client, "self1", "self123")

    resp = client.patch(
        f"/api/sessions/{created.json()['id']}/complete",
        json={
            "completed": True,
            "completion": "partial",
            "partial_from_ayah": 1,
            "partial_to_ayah": 3,
            "partial_note": "Family visit cut it short",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["completion"] == "partial"

    denied = client.patch(
        f"/api/sessions/{other_session.json()['id']}/complete",
        json={"completed": True, "completion": "full"},
    )
    assert denied.status_code == 403


def test_schedule_crud_and_access(client):
    login_admin(client)
    student = create_student(client, "Planner").json()

    bad_both = client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "day_of_week": 0,
            "date": "2026-08-10",
            "start_time": "18:00",
            "end_time": "19:00",
        },
    )
    assert bad_both.status_code == 400

    bad_times = client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "day_of_week": 1,
            "start_time": "19:00",
            "end_time": "18:00",
        },
    )
    assert bad_times.status_code == 400

    recurring = client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "label": "Memorisation",
            "day_of_week": 0,
            "start_time": "18:00",
            "end_time": "19:00",
        },
    )
    assert recurring.status_code == 201
    body = recurring.json()
    assert body["label"] == "Memorisation"
    assert body["day_of_week"] == 0
    assert body["student_name"] == "Planner"

    one_off = client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "date": "2026-08-10",
            "start_time": "09:00",
            "end_time": "09:30",
        },
    )
    assert one_off.status_code == 201

    listing = client.get(f"/api/schedule?student_id={student['id']}")
    assert listing.status_code == 200
    assert len(listing.json()) == 2

    updated = client.patch(
        f"/api/schedule/{body['id']}",
        json={"start_time": "17:30", "end_time": "18:30"},
    )
    assert updated.status_code == 200
    assert updated.json()["start_time"] == "17:30"

    other = create_student(client, "OtherSched").json()

    # Students see only their own schedule and cannot manage others'.
    client.post(
        "/api/users",
        json={"name": "Self", "username": "self2", "password": "self123", "role": "user"},
    )
    link_student_to_user(student["id"], "self2")
    login(client, "self2", "self123")
    assert len(client.get("/api/schedule").json()) == 2
    assert client.get("/api/schedule?student_id=9999").status_code == 200

    denied = client.post(
        "/api/schedule",
        json={"student_id": other["id"], "day_of_week": 2, "start_time": "10:00", "end_time": "11:00"},
    )
    assert denied.status_code == 403

    # A student can update and delete their own entry.
    deleted = client.delete(f"/api/schedule/{one_off.json()['id']}")
    assert deleted.status_code == 204
    assert len(client.get("/api/schedule").json()) == 1


def test_schedule_requires_auth(client):
    assert client.get("/api/schedule").status_code == 401


def test_student_alexa_config_permissions(client):
    login_admin(client)
    student = create_student(client, "Alexa Kid").json()
    assert student["alexa_schedule_enabled"] is False
    assert student["alexa_schedule_lead_minutes"] == 15

    patched = client.patch(
        f"/api/schedule/alexa/{student['id']}",
        json={"enabled": True, "lead_minutes": 30},
    )
    assert patched.status_code == 200
    assert patched.json()["alexa_schedule_enabled"] is True
    assert patched.json()["alexa_schedule_lead_minutes"] == 30

    listing = client.get("/api/students").json()
    assert listing[0]["alexa_schedule_enabled"] is True
    assert listing[0]["alexa_schedule_lead_minutes"] == 30

    # Students cannot configure reminders.
    client.post(
        "/api/users",
        json={"name": "Alexa User", "username": "alexa1", "password": "alexa123", "role": "user"},
    )
    link_student_to_user(student["id"], "alexa1")
    login(client, "alexa1", "alexa123")
    assert (
        client.patch(
            f"/api/schedule/alexa/{student['id']}",
            json={"enabled": False},
        ).status_code
        == 403
    )
    assert client.post(f"/api/schedule/alexa/test/{student['id']}").status_code == 403


def test_alexa_test_endpoint_publishes(client):
    login_admin(client)
    student = create_student(client, "Test Echo").json()

    resp = client.post(f"/api/schedule/alexa/test/{student['id']}")
    assert resp.status_code == 200
    assert resp.json()["published"] is False  # MQTT disabled in tests

    assert client.post("/api/schedule/alexa/test/9999").status_code == 404


def test_schedule_reminder_fires_at_lead_time(client, monkeypatch):
    login_admin(client)
    student = create_student(client, "Reminder Kid").json()
    client.patch(
        f"/api/schedule/alexa/{student['id']}",
        json={"enabled": True, "lead_minutes": 30},
    )
    now_dt = datetime(2026, 8, 3, 17, 30)  # Monday 17:30
    client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "label": "Memorisation",
            "day_of_week": now_dt.weekday(),
            "start_time": "18:00",
            "end_time": "19:00",
        },
    )

    from backend.app.services import reminders

    class FakeDatetime:
        @classmethod
        def now(cls, tz=None):
            return now_dt

        @classmethod
        def combine(cls, d, t):
            return datetime.combine(d, t)

    monkeypatch.setattr(reminders, "datetime", FakeDatetime)

    db = SessionLocal()
    try:
        fired = reminders.schedule_reminders_for_now(db)
    finally:
        db.close()

    assert fired == [("reminderkid", "Reminder Kid, Memorisation starts at 6:00pm.")]


def test_schedule_reminder_respects_toggle_lead_and_master_switch(client, monkeypatch):
    login_admin(client)
    on_student = create_student(client, "On Kid").json()
    off_student = create_student(client, "Off Kid").json()
    client.patch(f"/api/schedule/alexa/{on_student['id']}", json={"enabled": True, "lead_minutes": 15})
    client.patch(f"/api/schedule/alexa/{off_student['id']}", json={"enabled": False})

    now_dt = datetime(2026, 8, 3, 17, 45)  # Monday 17:45
    for student in (on_student, off_student):
        client.post(
            "/api/schedule",
            json={
                "student_id": student["id"],
                "label": "Study",
                "day_of_week": now_dt.weekday(),
                "start_time": "18:00",
                "end_time": "19:00",
            },
        )

    from backend.app.services import reminders

    class FakeDatetime:
        @classmethod
        def now(cls, tz=None):
            return now_dt

        @classmethod
        def combine(cls, d, t):
            return datetime.combine(d, t)

    monkeypatch.setattr(reminders, "datetime", FakeDatetime)

    db = SessionLocal()
    try:
        fired = reminders.schedule_reminders_for_now(db)
        slugs = {slug for slug, _ in fired}
        assert slugs == {"onkid"}

        # A wrong lead time means nothing fires.
        client.patch(f"/api/schedule/alexa/{on_student['id']}", json={"lead_minutes": 30})
        assert reminders.schedule_reminders_for_now(db) == []

        # Master Alexa switch off disables everything.
        client.patch("/api/settings", json={"alexa_enabled": False})
        client.patch(f"/api/schedule/alexa/{on_student['id']}", json={"lead_minutes": 15})
        assert reminders.schedule_reminders_for_now(db) == []
    finally:
        db.close()


def test_schedule_reminder_one_off_slot(client, monkeypatch):
    login_admin(client)
    student = create_student(client, "One Off Kid").json()
    client.patch(f"/api/schedule/alexa/{student['id']}", json={"enabled": True, "lead_minutes": 5})

    now_dt = datetime(2026, 8, 10, 9, 55)  # Monday 09:55
    client.post(
        "/api/schedule",
        json={
            "student_id": student["id"],
            "label": "Revision",
            "date": now_dt.date().isoformat(),
            "start_time": "10:00",
            "end_time": "10:30",
        },
    )

    from backend.app.services import reminders

    class FakeDatetime:
        @classmethod
        def now(cls, tz=None):
            return now_dt

        @classmethod
        def combine(cls, d, t):
            return datetime.combine(d, t)

    monkeypatch.setattr(reminders, "datetime", FakeDatetime)

    db = SessionLocal()
    try:
        fired = reminders.schedule_reminders_for_now(db)
    finally:
        db.close()

    assert fired == [("oneoffkid", "One Off Kid, Revision starts at 10:00am.")]


def test_creator_link_code_returns_8_chars(client):
    login_admin(client)

    resp = client.post("/api/auth/link-code")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["code"]) == 8
    assert "expires_at" in body


def test_non_creator_cannot_generate_link_code(client):
    login_admin(client)
    admin, user = make_users(client)

    client.post("/api/auth/logout")
    resp = login(client, "admin2", "admin2x")
    assert resp.status_code == 200

    resp = client.post("/api/auth/link-code")
    assert resp.status_code == 403

    client.post("/api/auth/logout")
    resp = login(client, "plain1", "plain12")
    assert resp.status_code == 200

    resp = client.post("/api/auth/link-code")
    assert resp.status_code == 403


def test_delete_student_removes_it(client):
    login_admin(client)

    student = create_student(client, "Temporary").json()

    resp = client.delete(f"/api/students/{student['id']}")
    assert resp.status_code == 204

    students = client.get("/api/students").json()
    assert all(s["id"] != student["id"] for s in students)


# ---- user management hardening ------------------------------------------


def make_users(client):
    """Create one admin and one user from the creator session. Returns their ids."""
    admin = client.post(
        "/api/users",
        json={"name": "Second Admin", "username": "admin2", "password": "admin2x", "role": "admin"},
    )
    assert admin.status_code == 201, admin.text
    user = client.post(
        "/api/users",
        json={"name": "Plain User", "username": "plain1", "password": "plain12", "role": "user"},
    )
    assert user.status_code == 201, user.text
    return admin.json(), user.json()


def test_creator_can_delete_admin_and_user(client):
    login_admin(client)
    admin, user = make_users(client)

    resp = client.delete(f"/api/users/{admin['id']}")
    assert resp.status_code == 204

    resp = client.delete(f"/api/users/{user['id']}")
    assert resp.status_code == 204

    users = {u["username"] for u in client.get("/api/users").json()}
    assert users == {"admin"}


def test_creator_cannot_delete_self(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()

    resp = client.delete(f"/api/users/{me['id']}")
    assert resp.status_code == 403

    me2 = client.get("/api/auth/me").json()
    assert me2["role"] == "creator"


def test_creator_cannot_disable_self(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()

    resp = client.patch(f"/api/users/{me['id']}", json={"is_active": False})
    assert resp.status_code == 403


def test_creator_can_change_roles(client):
    login_admin(client)
    _, user = make_users(client)

    resp = client.patch(f"/api/users/{user['id']}", json={"role": "admin"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

    resp = client.patch(f"/api/users/{user['id']}", json={"role": "user"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "user"


def test_admin_cannot_promote_user_to_admin(client):
    login_admin(client)
    _, user = make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{user['id']}", json={"role": "admin"})
    assert resp.status_code == 403


def test_admin_cannot_create_admin(client):
    login_admin(client)
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.post(
        "/api/users",
        json={"name": "Wannabe", "username": "admin3", "password": "admin3x", "role": "admin"},
    )
    assert resp.status_code == 403


def test_admin_cannot_delete_another_admin(client):
    login_admin(client)
    make_users(client)
    other = client.post(
        "/api/users",
        json={"name": "Third Admin", "username": "admin3", "password": "admin3x", "role": "admin"},
    )
    assert other.status_code == 201

    login(client, "admin2", "admin2x")
    resp = client.delete(f"/api/users/{other.json()['id']}")
    assert resp.status_code == 403


def test_admin_can_delete_user(client):
    login_admin(client)
    _, user = make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.delete(f"/api/users/{user['id']}")
    assert resp.status_code == 204

    # The admin's own listing shows only themselves.
    users = client.get("/api/users").json()
    assert len(users) == 1
    assert users[0]["username"] == "admin2"


def test_admin_cannot_delete_creator(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.delete(f"/api/users/{me['id']}")
    assert resp.status_code == 403


def test_admin_cannot_disable_creator(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{me['id']}", json={"is_active": False})
    assert resp.status_code == 403


def test_admin_cannot_disable_another_admin(client):
    login_admin(client)
    make_users(client)
    other = client.post(
        "/api/users",
        json={"name": "Third Admin", "username": "admin3", "password": "admin3x", "role": "admin"},
    )
    assert other.status_code == 201

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{other.json()['id']}", json={"is_active": False})
    assert resp.status_code == 403


def test_creator_can_reset_user_password(client):
    login_admin(client)
    _, user = make_users(client)

    resp = client.patch(f"/api/users/{user['id']}", json={"password": "newpass123"})
    assert resp.status_code == 200

    login(client, "plain1", "newpass123")
    me = client.get("/api/auth/me")
    assert me.status_code == 200


def test_admin_cannot_reset_creator_password(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{me['id']}", json={"password": "hacked"})
    assert resp.status_code == 403


def test_creator_can_edit_own_name_and_password(client):
    login_admin(client)
    me = client.get("/api/auth/me").json()

    resp = client.patch(f"/api/users/{me['id']}", json={"name": "Owner"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Owner"

    resp = client.patch(f"/api/users/{me['id']}", json={"password": "newcreatorpw"})
    assert resp.status_code == 200

    login(client, "admin", "newcreatorpw")
    assert client.get("/api/auth/me").status_code == 200


def test_admin_can_change_own_password(client):
    login_admin(client)
    make_users(client)

    login(client, "admin2", "admin2x")
    me_id = client.get("/api/auth/me").json()["id"]
    resp = client.patch(f"/api/users/{me_id}", json={"password": "rotated"})
    assert resp.status_code == 200

    login(client, "admin2", "rotated")
    assert client.get("/api/auth/me").status_code == 200


def test_admin_can_disable_user(client):
    login_admin(client)
    _, user = make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{user['id']}", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


def test_list_users_scoped_to_self_for_non_creator(client):
    login_admin(client)
    make_users(client)

    login(client, "admin2", "admin2x")
    users = client.get("/api/users").json()
    assert [u["username"] for u in users] == ["admin2"]

    login(client, "plain1", "plain12")
    users = client.get("/api/users").json()
    assert [u["username"] for u in users] == ["plain1"]


def test_user_can_change_own_name_and_password_only(client):
    login_admin(client)
    admin, user = make_users(client)

    login(client, "plain1", "plain12")
    me_id = client.get("/api/auth/me").json()["id"]
    resp = client.patch(f"/api/users/{me_id}", json={"name": "Renamed", "password": "newplain"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"

    login(client, "plain1", "newplain")
    me = client.get("/api/auth/me").json()
    assert me["name"] == "Renamed"

    # A plain user cannot promote themselves, disable themselves, or link a student.
    assert client.patch(f"/api/users/{me_id}", json={"role": "admin"}).status_code == 403
    assert client.patch(f"/api/users/{me_id}", json={"is_active": False}).status_code == 403
    assert client.patch(f"/api/users/{me_id}", json={"student_id": 1}).status_code == 403
    # ... and cannot touch other accounts (the admin here).
    assert client.patch(f"/api/users/{admin['id']}", json={"password": "hack123"}).status_code == 403
    assert client.patch(f"/api/users/{admin['id']}", json={"is_active": False}).status_code == 403


def test_admin_can_create_student_login(client):
    login_admin(client)
    student = create_student(client, "LoginKid").json()
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.post(
        "/api/users",
        json={
            "name": "LoginKid",
            "username": "loginkid",
            "password": "kid1234",
            "role": "user",
            "student_id": student["id"],
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["student_id"] == student["id"]

    login(client, "loginkid", "kid1234")
    assert client.get("/api/auth/me").status_code == 200


def test_admin_can_reset_student_login_password(client):
    login_admin(client)
    student = create_student(client, "ResKid").json()
    make_users(client)
    created = client.post(
        "/api/users",
        json={
            "name": "ResKid",
            "username": "reskid",
            "password": "oldpass",
            "role": "user",
            "student_id": student["id"],
        },
    )
    assert created.status_code == 201

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{created.json()['id']}", json={"password": "newpass"})
    assert resp.status_code == 200

    login(client, "reskid", "newpass")
    assert client.get("/api/auth/me").status_code == 200


def test_student_logins_endpoint(client):
    login_admin(client)
    s1 = create_student(client, "SOne").json()
    s2 = create_student(client, "STwo").json()
    client.post(
        "/api/users",
        json={"name": "SOne", "username": "sone1", "password": "sone123", "role": "user", "student_id": s1["id"]},
    )
    client.post(
        "/api/users",
        json={"name": "STwo", "username": "stwo1", "password": "stwo123", "role": "user", "student_id": s2["id"]},
    )
    client.post(
        "/api/users",
        json={"name": "Plain", "username": "plain9", "password": "plain99", "role": "user"},
    )
    make_users(client)

    login(client, "admin2", "admin2x")
    logins = client.get("/api/users/student-logins").json()
    by_student = {u["student_id"]: u["username"] for u in logins}
    assert by_student == {s1["id"]: "sone1", s2["id"]: "stwo1"}

    # A plain user is denied.
    login(client, "plain1", "plain12")
    assert client.get("/api/users/student-logins").status_code == 403


# ---- student <-> user linking -------------------------------------------


def test_create_user_with_student_link(client):
    login_admin(client)
    student = create_student(client, "Linked").json()

    resp = client.post(
        "/api/users",
        json={"name": "Link", "username": "link1", "password": "link123", "role": "user", "student_id": student["id"]},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["student_id"] == student["id"]

    # The linked user only sees their own student's data.
    login(client, "link1", "link123")
    stats = client.get("/api/stats").json()
    assert [s["id"] for s in stats["students"]] == [student["id"]]


def test_student_link_unique_and_validation(client):
    login_admin(client)
    s1 = create_student(client, "One").json()
    s2 = create_student(client, "Two").json()

    a = client.post(
        "/api/users",
        json={"name": "A", "username": "aa1", "password": "aa1234", "role": "user", "student_id": s1["id"]},
    )
    assert a.status_code == 201

    # Same student cannot be linked to a second user.
    dup = client.post(
        "/api/users",
        json={"name": "B", "username": "bb1", "password": "bb1234", "role": "user", "student_id": s1["id"]},
    )
    assert dup.status_code == 409

    # Unknown student is rejected.
    bad = client.post(
        "/api/users",
        json={"name": "C", "username": "cc1", "password": "cc1234", "role": "user", "student_id": 9999},
    )
    assert bad.status_code == 400

    # Moving a link to another student, and conflicts on update.
    b = client.post(
        "/api/users",
        json={"name": "B", "username": "bb1", "password": "bb1234", "role": "user"},
    )
    assert b.status_code == 201
    resp = client.patch(f"/api/users/{b.json()['id']}", json={"student_id": s2["id"]})
    assert resp.status_code == 200
    assert resp.json()["student_id"] == s2["id"]

    resp = client.patch(f"/api/users/{a.json()['id']}", json={"student_id": s2["id"]})
    assert resp.status_code == 409

    # Unlink.
    resp = client.patch(f"/api/users/{a.json()['id']}", json={"student_id": None})
    assert resp.status_code == 200
    assert resp.json()["student_id"] is None
