"""Customer messaging: providers (mock / Twilio / Meta WhatsApp Cloud / MSG91) + templates."""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.integrations import _setting

log = logging.getLogger("rto_shield.messaging")

Channel = Literal["whatsapp", "sms"]


@dataclass
class SendResult:
    ok: bool
    provider: str
    message_id: str | None
    error: str | None = None


def to_e164(phone: str | None, default_cc: str = "91") -> str | None:
    """Normalise an Indian phone number to E.164 (+91XXXXXXXXXX). Returns None if unusable."""
    if not phone:
        return None
    s = str(phone).strip()
    if s.lower().startswith("whatsapp:"):
        s = s[9:]
    plus = s.startswith("+")
    d = re.sub(r"\D", "", s)
    if plus and not d.startswith(default_cc) and 8 <= len(d) <= 15:
        return "+" + d  # explicit foreign number
    if d.startswith("00"):
        d = d[2:]
    if len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if len(d) == 12 and d.startswith(default_cc):
        d = d[2:]
    if len(d) != 10:
        return None
    return f"+{default_cc}{d}"


class MessagingProvider:
    name: str = "base"

    async def send(self, to: str, channel: Channel, body: str, meta: dict | None = None) -> SendResult:
        raise NotImplementedError


class MockProvider(MessagingProvider):
    name = "mock"

    def __init__(self):
        self.sent: list[dict] = []

    async def send(self, to: str, channel: Channel, body: str, meta: dict | None = None) -> SendResult:
        mid = "mock-" + uuid.uuid4().hex[:12]
        rec = {"id": mid, "to": to_e164(to) or to, "channel": channel, "body": body, "meta": meta or {},
               "at": datetime.now().isoformat(timespec="seconds")}
        self.sent.append(rec)
        if len(self.sent) > 1000:
            del self.sent[:-1000]
        log.info("[mock %s] to=%s: %s", channel, rec["to"], body[:120])
        return SendResult(True, self.name, mid)


async def _post(url: str, *, provider: str, **kw) -> tuple[bool, dict | None, str | None]:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, **kw)
        try:
            data = r.json()
        except ValueError:
            data = {"raw": r.text[:300]}
        if r.status_code >= 400:
            msg = data.get("message") if isinstance(data, dict) else None
            if isinstance(data, dict) and isinstance(data.get("error"), dict):
                msg = data["error"].get("message") or msg
            return False, data, f"{provider} HTTP {r.status_code}: {msg or str(data)[:200]}"
        return True, data, None
    except httpx.HTTPError as e:
        return False, None, f"{provider} request failed: {e}"


class TwilioProvider(MessagingProvider):
    name = "twilio"

    def __init__(self, sid: str | None = None, token: str | None = None, from_: str | None = None):
        self.sid = sid or _setting("twilio_sid")
        self.token = token or _setting("twilio_token")
        self.from_ = from_ or _setting("twilio_from")

    async def send(self, to: str, channel: Channel, body: str, meta: dict | None = None) -> SendResult:
        if not (self.sid and self.token and self.from_):
            return SendResult(False, self.name, None, "Twilio not configured (sid/token/from)")
        num = to_e164(to)
        if not num:
            return SendResult(False, self.name, None, f"Invalid phone number: {to!r}")
        frm = str(self.from_)
        if channel == "whatsapp":
            num = "whatsapp:" + num
            if not frm.startswith("whatsapp:"):
                frm = "whatsapp:" + (to_e164(frm) or frm)
        else:
            frm = frm.replace("whatsapp:", "")
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json"
        data = {"To": num, "From": frm, "Body": body}
        if meta and meta.get("status_callback"):
            data["StatusCallback"] = meta["status_callback"]
        ok, resp, err = await _post(url, provider=self.name, data=data, auth=(self.sid, self.token))
        return SendResult(ok, self.name, (resp or {}).get("sid") if ok else None, err)


class MetaWhatsAppProvider(MessagingProvider):
    """WhatsApp Cloud API. Note: free-form text only works inside the 24h customer-service window;
    business-initiated messages need an approved template (pass ``meta={"template": {...}}``)."""

    name = "meta_whatsapp"
    API = "https://graph.facebook.com/v20.0"

    def __init__(self, token: str | None = None, phone_id: str | None = None):
        self.token = token or _setting("meta_wa_token")
        self.phone_id = phone_id or _setting("meta_wa_phone_id")

    async def send(self, to: str, channel: Channel, body: str, meta: dict | None = None) -> SendResult:
        if channel != "whatsapp":
            return SendResult(False, self.name, None, "Meta WhatsApp provider supports channel 'whatsapp' only")
        if not (self.token and self.phone_id):
            return SendResult(False, self.name, None, "Meta WhatsApp not configured (token/phone id)")
        num = to_e164(to)
        if not num:
            return SendResult(False, self.name, None, f"Invalid phone number: {to!r}")
        payload: dict = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": num.lstrip("+")}
        if meta and meta.get("template"):
            payload.update(type="template", template=meta["template"])
        else:
            payload.update(type="text", text={"preview_url": True, "body": body})
        ok, resp, err = await _post(f"{self.API}/{self.phone_id}/messages", provider=self.name, json=payload,
                                    headers={"Authorization": f"Bearer {self.token}"})
        mid = None
        if ok and isinstance(resp, dict):
            mid = ((resp.get("messages") or [{}])[0]).get("id")
        return SendResult(ok, self.name, mid, err)


class Msg91Provider(MessagingProvider):
    """MSG91: SMS via Flow API (DLT-approved flow template id required in India), WhatsApp via
    the outbound session-message API (integrated number required)."""

    name = "msg91"
    FLOW_URL = "https://control.msg91.com/api/v5/flow/"
    WA_URL = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/"

    def __init__(self, authkey: str | None = None, template_id: str | None = None,
                 wa_number: str | None = None):
        self.authkey = authkey or _setting("msg91_key")
        self.template_id = template_id or _setting("msg91_template_id")
        self.wa_number = wa_number or _setting("msg91_wa_number")

    async def send(self, to: str, channel: Channel, body: str, meta: dict | None = None) -> SendResult:
        meta = meta or {}
        if not self.authkey:
            return SendResult(False, self.name, None, "MSG91 not configured (authkey)")
        num = to_e164(to)
        if not num:
            return SendResult(False, self.name, None, f"Invalid phone number: {to!r}")
        headers = {"authkey": str(self.authkey), "accept": "application/json", "content-type": "application/json"}
        if channel == "sms":
            tid = meta.get("template_id") or self.template_id
            if not tid:
                return SendResult(False, self.name, None, "MSG91 SMS needs a flow template_id (DLT)")
            recipient = {"mobiles": num.lstrip("+"), "body": body, **(meta.get("variables") or {})}
            payload = {"template_id": tid, "short_url": "1", "recipients": [recipient]}
            ok, resp, err = await _post(self.FLOW_URL, provider=self.name, json=payload, headers=headers)
        else:
            wa = meta.get("integrated_number") or self.wa_number
            if not wa:
                return SendResult(False, self.name, None, "MSG91 WhatsApp needs an integrated number")
            payload = {"integrated_number": str(wa).lstrip("+"), "content_type": "text",
                       "payload": {"to": num.lstrip("+"), "type": "text", "text": {"body": body}}}
            ok, resp, err = await _post(self.WA_URL, provider=self.name, json=payload, headers=headers)
        if ok and isinstance(resp, dict) and str(resp.get("type", "")).lower() == "error":
            return SendResult(False, self.name, None, f"msg91: {resp.get('message')}")
        mid = None
        if ok and isinstance(resp, dict):
            mid = resp.get("request_id") or resp.get("message") or resp.get("data")
            mid = str(mid) if mid is not None else None
        return SendResult(ok, self.name, mid, err)


_MOCK_SINGLETON: MockProvider | None = None


def get_provider(name: str | None = None) -> MessagingProvider:
    """Return provider by name (default: settings.messaging_provider). Unknown -> mock."""
    global _MOCK_SINGLETON
    n = (name or _setting("messaging_provider", "mock") or "mock").strip().lower()
    if n == "twilio":
        return TwilioProvider()
    if n in ("meta_whatsapp", "meta", "whatsapp_cloud"):
        return MetaWhatsAppProvider()
    if n == "msg91":
        return Msg91Provider()
    if _MOCK_SINGLETON is None:
        _MOCK_SINGLETON = MockProvider()
    return _MOCK_SINGLETON


# ----------------------------------------------------------------------------------------
# Templates
# ----------------------------------------------------------------------------------------
PREPAID_DISCOUNT = 30

TEMPLATES: dict[str, dict[str, str]] = {
    "confirm": {
        "en": ("Hi {name}! Thanks for shopping with {store}. Your order {order_id} of {value} "
               "(Cash on Delivery) is ready to ship. Please tap to confirm: {link}"),
        "hi": ("नमस्ते {name}! {store} से खरीदारी के लिए धन्यवाद। आपका ऑर्डर {order_id} ({value}, "
               "कैश ऑन डिलीवरी) भेजने के लिए तैयार है। कृपया कन्फर्म करें: {link}"),
    },
    "prepaid_nudge": {
        "en": ("Hi {name}! Pay online for your {store} order {order_id} & get ₹{discount} off + faster "
               "delivery. Pay just {new_value} here: {link}"),
        "hi": ("नमस्ते {name}! {store} ऑर्डर {order_id} का ऑनलाइन भुगतान करें और पाएं ₹{discount} की छूट + "
               "जल्दी डिलीवरी। सिर्फ {new_value} चुकाएं: {link}"),
    },
    "address_verify": {
        "en": ("Hi {name}, we want your {store} order {order_id} to reach you on time. Please confirm or "
               "complete your delivery address (PIN {pincode}): {link}"),
        "hi": ("नमस्ते {name}, हम चाहते हैं कि आपका {store} ऑर्डर {order_id} समय पर पहुंचे। कृपया अपना "
               "पूरा पता कन्फर्म करें (पिन {pincode}): {link}"),
    },
}


def _inr(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "₹—"
    n = int(round(f))
    s = str(abs(n))
    if len(s) > 3:  # Indian digit grouping 1,23,456
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
        s = head + "," + tail
    return ("-₹" if n < 0 else "₹") + s


def render_template(kind: Literal["confirm", "prepaid_nudge", "address_verify"], order: dict, link: str,
                    store_name: str, lang: Literal["en", "hi"] = "en") -> str:
    tpl = TEMPLATES.get(kind) or TEMPLATES["confirm"]
    text = tpl.get(lang) or tpl["en"]
    order = order or {}
    full = str(order.get("customer_name") or "").strip()
    name = full.split()[0] if full else ("there" if lang != "hi" else "ग्राहक")
    value = order.get("order_value") or 0
    try:
        new_value = max(0.0, float(value) - PREPAID_DISCOUNT)
    except (TypeError, ValueError):
        new_value = 0.0
    oid = str(order.get("order_id") or "")
    if oid and not oid.startswith("#"):
        oid = "#" + oid
    return text.format(name=name, store=store_name or "our store", order_id=oid or "", value=_inr(value),
                       discount=PREPAID_DISCOUNT, new_value=_inr(new_value),
                       pincode=order.get("pincode") or "", link=link)


__all__ = ["SendResult", "MessagingProvider", "MockProvider", "TwilioProvider", "MetaWhatsAppProvider",
           "Msg91Provider", "get_provider", "render_template", "to_e164", "TEMPLATES"]
