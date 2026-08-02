import json
import logging

import paho.mqtt.client as mqtt

from ..config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

TOPIC_PREFIX = "hifz"
TOPIC_REVISION = f"{TOPIC_PREFIX}/revision"
TOPIC_REVISION_ALL = f"{TOPIC_PREFIX}/revision/+"


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

    def publish_revision(self, student_slug: str, message: str) -> bool:
        if self._client is None:
            logger.info("MQTT not connected; not publishing revision for %s", student_slug)
            return False
        topic = f"{TOPIC_REVISION}/{student_slug}"
        payload = json.dumps({"message": message})
        result = self._client.publish(topic, payload, qos=1)
        ok = result.rc == mqtt.MQTT_ERR_SUCCESS
        logger.info("MQTT publish %s -> %s ok=%s", topic, message, ok)
        return ok

    def shutdown(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None


publisher = MqttPublisher()
