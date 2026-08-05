# Home Assistant + Alexa setup for Quran app reminders

The Quran Hifz Tracker app publishes MQTT messages that Home Assistant turns
into spoken announcements on your Echo speakers. This guide sets up that pipe
and gives you ready-to-paste automation YAML.

## What the app publishes

| Topic | When | Payload |
| --- | --- | --- |
| `hifz/revision/<student>` | Fixed times from Settings ("Alexa revision reminders") | `{"message": "..."}` |
| `hifz/schedule/<student>/remind` | Before each schedule slot (`start time − lead`) | `{"message": "..."}` |
| `hifz/schedule/<student>/state` | Whenever a student's timetable changes | `{"student": "...", "slots": [...]}` |

`<student>` is a slug of the student's name (e.g. `sara`). The MQTT broker
address and credentials are **your own** and are set on the app server via
env vars (see `README.md` → "Placeholders to replace"): `HIFZ_MQTT_HOST`,
`HIFZ_MQTT_PORT`, `HIFZ_MQTT_USER`, `HIFZ_MQTT_PASS`. Use the exact same
broker values here as in the app's `.env`.

## Step 1 — Add the MQTT integration in Home Assistant

1. Open Home Assistant → **Settings** → **Devices & Services** → **Add Integration**.
2. Search for **MQTT** and add it.
3. Enter the same broker details you set in the app's `.env` (replace the
   placeholders with your real values — see `README.md`):
   - Broker: `<your-mqtt-broker-host>`
   - Port: `1883`
   - Username: `<your-mqtt-username>`
   - Password: `<your-mqtt-password>`
4. Save. HA is now subscribed to the broker.

## Step 2 — Install the Alexa Media Player integration

The app does not call Alexa directly; HA talks to your Echo speakers through
the **Alexa Media Player** custom integration.

1. Install **HACS** if you don't have it (see hacs.xyz).
2. HACS → **Integrations** → search **Alexa Media Player** → download.
3. Restart Home Assistant.
4. Settings → Devices & Services → Add Integration → **Alexa Media Player**.
5. Log in with your Amazon account. Your Echo devices should appear.

## Step 3 — Add the announcement automation

In **Settings → Automations → Create Automation → Create New Automation**,
switch to **Edit in YAML mode** and paste:

```yaml
alias: Quran schedule reminders
description: Announce Quran schedule reminders on the Echo speakers
trigger:
  - platform: mqtt
    topic: "hifz/schedule/+/remind"
condition: []
action:
  - data:
      data:
        type: tts
        method: all
      target:
        - media_player.echo_dot_back_room
        - media_player.echo_dot_front_room
        - media_player.echo_pop_hallway
      message: "{{ trigger.payload_json.message }}"
    action: notify.alexa_media
mode: single
```

Optional — announce the fixed-time revision reminders too:

```yaml
alias: Quran revision reminders
description: Announce revision reminders at the fixed times from Settings
trigger:
  - platform: mqtt
    topic: "hifz/revision/+"
condition: []
action:
  - data:
      data:
        type: tts
        method: all
      target:
        - media_player.echo_dot_back_room
        - media_player.echo_dot_front_room
        - media_player.echo_pop_hallway
      message: "{{ trigger.payload_json.message }}"
    action: notify.alexa_media
mode: single
```

Notes:

- This uses the exact same `notify.alexa_media` pattern as your other
  automation (`type: tts`, `method: all`), just with the MQTT message as the
  text.
- The `target:` list is your Echo devices — keep or change those entity IDs to
  match the speakers you want announcements on.
- `mode: single` is fine since each announcement happens at most once a minute.

## Step 4 — Verify

1. Open the app → **Settings** → **Alexa schedule reminders**.
2. Pick a student, tick "Announce schedule reminders for <name>", set the lead
   minutes, and press **Send test announcement**.
3. You should hear "This is a test announcement from the Quran app." on your
   Echo speakers within a couple of seconds.
4. When a real slot is about to start (e.g. 30 minutes before), Alexa should
   announce "Sara, Memorisation starts at 6:00pm."
