import json
import logging

import paho.mqtt.client as mqtt

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

TOPIC_PREFIX = "hifz"
TOPIC_REVISION = f"{TOPIC_PREFIX}/revision"
TOPIC_REVISION_ALL = f"{TOPIC_PREFIX}/revision/+"
TOPIC_SCHEDULE = f"{TOPIC_PREFIX}/schedule"


class MqttPublisher:
    def __init__(self) -> None:
        self._client: mqtt.Client | None = None
        self._enabled = bool(settings.mqtt_host)

    def connect(self) -> None:
        if not self._enabled:
            logger.info("MQTT disabled (no host configured)")
            return
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.username_pw_set(settings.mqtt_user, settings.mqtt_pass)
        try:
            client.connect(settings.mqtt_host, settings.mqtt_port, keepalive=30)
            client.loop_start()
            self._client = client
            logger.info("MQTT connected to %s:%s", settings.mqtt_host, settings.mqtt_port)
        except Exception as exc:  # pragma: no cover - network dependent
            logger.warning("MQTT connection failed: %s", exc)

    def _publish(self, topic: str, payload: dict) -> bool:
        if self._client is None:
            logger.info("MQTT not connected; not publishing to %s", topic)
            return False
        message = json.dumps(payload)
        result = self._client.publish(topic, message, qos=1)
        ok = result.rc == mqtt.MQTT_ERR_SUCCESS
        logger.info("MQTT publish %s -> %s ok=%s", topic, message, ok)
        return ok

    def publish_revision(self, student_slug: str, message: str) -> bool:
        return self._publish(
            f"{TOPIC_REVISION}/{student_slug}", {"message": message}
        )

    def publish_schedule_reminder(self, student_slug: str, message: str) -> bool:
        return self._publish(
            f"{TOPIC_SCHEDULE}/{student_slug}/remind", {"message": message}
        )

    def publish_schedule_state(self, student_slug: str, state: list[dict]) -> bool:
        return self._publish(
            f"{TOPIC_SCHEDULE}/{student_slug}/state", {"student": student_slug, "slots": state}
        )

    def shutdown(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None


publisher = MqttPublisher()
