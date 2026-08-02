import pytest


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
    assert resp.json()["role"] == "admin"
    assert client.cookies.get("hifz_session")

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"


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

    rev_resp = create_session(client, student["id"], "revision", yasin, 440, 441)
    assert rev_resp.status_code == 201
    assert rev_resp.json()["kind"] == "revision"

    stats = client.get("/api/stats")
    assert stats.status_code == 200
    body = stats.json()

    progress = body["progress"][str(student["id"])]
    assert progress["memorised_pages"] == 3

    recent_kinds = {s["kind"] for s in body["recent_sessions"]}
    assert recent_kinds == {"new", "revision"}
    assert body["total_sessions"] == 2


def test_invalid_page_range_returns_400(client):
    login_admin(client)

    student = create_student(client, "Zaynab").json()
    yasin = surah_id_by_number(client, 36)

    resp = create_session(client, student["id"], "new", yasin, 100, 102)
    assert resp.status_code == 400


def test_from_page_greater_than_to_page_returns_400(client):
    login_admin(client)

    student = create_student(client, "Yusuf").json()
    yasin = surah_id_by_number(client, 36)

    resp = create_session(client, student["id"], "new", yasin, 442, 440)
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
