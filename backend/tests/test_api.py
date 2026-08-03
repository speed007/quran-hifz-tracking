import pytest
from datetime import date, timedelta


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


def test_link_code_returns_8_chars(client):
    login_admin(client)

    resp = client.post("/api/auth/link-code")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["code"]) == 8
    assert "expires_at" in body


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


def test_admin_cannot_delete_user(client):
    login_admin(client)
    _, user = make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.delete(f"/api/users/{user['id']}")
    assert resp.status_code == 403


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


def test_admin_cannot_change_own_password(client):
    login_admin(client)
    make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{client.get('/api/auth/me').json()['id']}", json={"password": "rotated"})
    assert resp.status_code == 403


def test_admin_cannot_disable_user(client):
    login_admin(client)
    _, user = make_users(client)

    login(client, "admin2", "admin2x")
    resp = client.patch(f"/api/users/{user['id']}", json={"is_active": False})
    assert resp.status_code == 403
