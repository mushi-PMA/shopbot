"""Safety rules that run in code, before the model, so they cost no tokens and cannot be talked around."""
import re

INJECTION = re.compile(
    r"ignore (all |any |the |your )?(previous|prior|above|earlier|system)?\s*(instructions|rules|prompt|messages)"
    r"|disregard (all |any |the |your )?(previous|prior|above|system)?\s*(instructions|rules|prompt)"
    r"|forget (all |your )?(previous |prior )?(instructions|rules)"
    r"|(reveal|show|print|repeat|output|leak|tell me) (me )?(your|the) (system )?(prompt|instructions|rules|hidden)"
    r"|system prompt|developer mode|jailbreak|\bDAN\b|do anything now"
    r"|you are (now|no longer)|from now on you are|pretend (to be|you are)|act as (an? )?(admin|developer|system|root|different|unrestricted)"
    r"|new instructions?:|<\s*/?\s*(system|instructions?)\s*>|\[\s*system\s*\]|#{3,}\s*system"
    r"|(admin|god|sudo|root) mode|override (the |your )?(rules|price|system)"
    r"|(set|change|update|edit) (the |its |all )?(prices?|stock)\b.{0,30}\b(to|=)"
    r"|(other|another|all|every) (other )?(customers?|users?)'?s? (orders?|data|addresses|details|carts?|names?)"
    r"|(drop|delete|truncate) table|(show|give|tell|print|reveal) (me )?(your|the) api key",
    re.I,
)

OFF_TOPIC = re.compile(
    r"\b(write|generate|debug|fix|solve)\b.{0,40}\b(code|program|script|python|java(script)?|sql|essay|poem|story|"
    r"homework|assignment|song|lyrics|email to my boss)\b"
    r"|\b(capital of|who won|weather (in|today|forecast)|bitcoin|crypto|stock market|election|prime minister|president of)\b"
    r"|\b(diagnos|medicine for|symptoms? of|legal advice|lawyer|tax return)\w*"
    r"|\b(how to (make|build) (a )?(bomb|weapon|drug))",
    re.I,
)

INJECTION_REPLY = ("I can't do that. I'm Malik Brothers' shopping assistant, so I only follow the store's rules. "
                   "I can help you find products, manage your cart, place or track orders, and answer store questions.")
OFF_TOPIC_REPLY = ("Sorry, I can only help with shopping at Malik Brothers: finding products, your cart, orders, "
                   "delivery and returns. What can I help you find today?")


def check_message(text: str) -> tuple[str, str] | None:
    """Return (reason, reply) if the message must be refused without calling the model."""
    if INJECTION.search(text):
        return "prompt_injection", INJECTION_REPLY
    if OFF_TOPIC.search(text):
        return "off_topic", OFF_TOPIC_REPLY
    return None
