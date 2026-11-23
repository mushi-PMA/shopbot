"""Run tests.json against a deployed agent API and write bench/results.json plus a Markdown table.
Usage (from agent/): python bench/run_bench.py https://<agent-api> [--runs 1]
Each run uses fresh user ids (suffix), so runs never share memory or orders."""
import json
import statistics
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6


def check(turn: dict, reply: dict) -> list[str]:
    text = reply["reply"].lower()
    names = [c["name"] for c in reply["tool_calls"]]
    problems = [f"missing tool {t}" for t in turn.get("tools", []) if t not in names]
    if turn.get("no_tools") and names:
        problems.append(f"unexpected tools {names}")
    if turn.get("any") and not any(w.lower() in text for w in turn["any"]):
        problems.append(f"reply lacks any of {turn['any']}")
    problems += [f"reply contains {w!r}" for w in turn.get("none", []) if w.lower() in text]
    return problems


def main() -> None:
    base = sys.argv[1].rstrip("/")
    runs = int(sys.argv[sys.argv.index("--runs") + 1]) if "--runs" in sys.argv else 1
    data = json.loads((ROOT / "tests.json").read_text(encoding="utf-8"))
    cases = data["cases"] + data.get("attack_tests", [])
    client = httpx.Client(timeout=90)
    rows, latencies, tokens_in, tokens_out = [], [], 0, 0
    for run in range(runs):
        suffix = f"-{int(time.time())}-{run}"
        for case in cases:
            failures = []
            for turn in case["turns"]:
                body = {"user_id": case["user_id"] + suffix, "thread_id": turn.get("thread_id", case["thread_id"]),
                        "message": turn["message"]}
                started = time.perf_counter()
                reply = client.post(f"{base}/chat", json=body).json()
                latencies.append(time.perf_counter() - started)
                tokens_in += reply["tokens"]["in"]
                tokens_out += reply["tokens"]["out"]
                failures += check(turn, reply)
                print(f"[{case['id']}] {turn['message'][:60]!r} -> {reply['reply'][:90]!r} {[c['name'] for c in reply['tool_calls']]}")
            rows.append({"run": run, "id": case["id"], "name": case["name"], "category": case["category"],
                         "passed": not failures, "failures": failures})
    turns = len(latencies)
    summary = {
        "base_url": base, "runs": runs, "cases": len(rows), "passed": sum(r["passed"] for r in rows),
        "own_cases_passed": f"{sum(r['passed'] for r in rows if r['category'] != 'attack')}/{sum(r['category'] != 'attack' for r in rows)}",
        "attack_tests_passed": f"{sum(r['passed'] for r in rows if r['category'] == 'attack')}/{sum(r['category'] == 'attack' for r in rows)}",
        "turns": turns, "latency_p50_s": round(statistics.median(latencies), 2),
        "latency_p95_s": round(sorted(latencies)[max(0, int(0.95 * turns) - 1)], 2),
        "tokens_in_per_turn": round(tokens_in / turns), "tokens_out_per_turn": round(tokens_out / turns),
        "cost_per_turn_usd": round((tokens_in * PRICE_IN + tokens_out * PRICE_OUT) / turns, 6),
        "cost_total_usd": round(tokens_in * PRICE_IN + tokens_out * PRICE_OUT, 5),
    }
    out = Path(__file__).with_name("results.json")
    out.write_text(json.dumps({"summary": summary, "cases": rows}, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    for r in rows:
        print(("PASS" if r["passed"] else "FAIL"), r["id"], r["name"], "; ".join(r["failures"]))


if __name__ == "__main__":
    main()
