"""Streamlit console for testing the deployed civic-vision agent API."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests
import streamlit as st


DEFAULT_API_URL = os.getenv("AGENT_API_URL", "https://ai4all-civic-vision.onrender.com")
SNAPSHOT_PATH = os.path.join(os.path.dirname(__file__), "agent_console_last_response.json")

AGENTS = {
    "regulations": "Local Regulations",
    "safety": "Safety",
    "sociologist": "Sociologist",
    "heritage": "Heritage",
    "mobility": "Mobility & Environment",
}

HOTSPOTS = [
    {"id": "placa-catalunya", "name": "Pla\u00e7a Catalunya", "type": "square", "neighborhood": "Eixample / Ciutat Vella"},
    {"id": "la-rambla", "name": "La Rambla", "type": "boulevard", "neighborhood": "Ciutat Vella"},
    {"id": "passeig-de-gracia", "name": "Passeig de Gr\u00e0cia", "type": "boulevard", "neighborhood": "Eixample"},
    {"id": "barceloneta-beach", "name": "Barceloneta Beach", "type": "beach", "neighborhood": "Barceloneta"},
    {"id": "park-guell", "name": "Park G\u00fcell Upper Terrace", "type": "park", "neighborhood": "Gr\u00e0cia / El Carmel"},
]
HOTSPOT_BY_ID = {hotspot["id"]: hotspot for hotspot in HOTSPOTS}

EXAMPLE_PROPOSALS = {
    "Shaded seating": {
        "proposal": "Add shaded seating, drinking fountains, and wider pedestrian space.",
        "hotspot_id": "placa-catalunya",
    },
    "Bike corridor": {
        "proposal": "Create a protected cycling corridor with fewer car lanes and more trees.",
        "hotspot_id": "passeig-de-gracia",
    },
    "Beach facilities": {
        "proposal": "Add accessible lockers, ramps, public toilets, and shaded rest areas.",
        "hotspot_id": "barceloneta-beach",
    },
}


def clean_api_url(value: str) -> str:
    return value.strip().rstrip("/")


def hotspot_label(hotspot_id: str) -> str:
    hotspot = HOTSPOT_BY_ID[hotspot_id]
    return f"{hotspot['name']} - {hotspot['neighborhood']}"


def apply_example(example_name: str) -> None:
    if st.session_state.get("_active_example") == example_name:
        return

    example = EXAMPLE_PROPOSALS.get(example_name, {})
    st.session_state["proposal_text"] = example.get("proposal", "")
    st.session_state["selected_hotspot_id"] = example.get("hotspot_id", HOTSPOTS[0]["id"])
    st.session_state["_active_example"] = example_name


def request_json(
    method: str,
    api_url: str,
    path: str,
    timeout: int,
    bypass_proxy: bool,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with requests.Session() as session:
        session.trust_env = not bypass_proxy
        response = session.request(method, f"{api_url}{path}", json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()


def api_get(api_url: str, path: str, timeout: int, bypass_proxy: bool) -> dict[str, Any]:
    return request_json("GET", api_url, path, timeout, bypass_proxy)


def api_post(
    api_url: str,
    path: str,
    payload: dict[str, Any],
    timeout: int,
    bypass_proxy: bool,
) -> dict[str, Any]:
    return request_json("POST", api_url, path, timeout, bypass_proxy, payload)


def save_response_snapshot(kind: str, data: dict[str, Any]) -> None:
    snapshot = {"kind": kind, "data": data}
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as file:
        json.dump(snapshot, file, indent=2, ensure_ascii=False)


def show_request_error(error: Exception) -> None:
    if isinstance(error, requests.HTTPError) and error.response is not None:
        st.error(f"Request failed: HTTP {error.response.status_code}")
        st.code(error.response.text[:2000], language="text")
        return
    st.error(f"Request failed: {error}")


def is_agent_error(agent: dict[str, Any]) -> bool:
    feedback = str(agent.get("feedback", ""))
    return feedback.lower().startswith("agent error:") or "error code:" in feedback.lower()


def is_rate_limit_error(agent: dict[str, Any]) -> bool:
    feedback = str(agent.get("feedback", "")).lower()
    return "rate limit" in feedback or "rate_limit" in feedback or "error code: 429" in feedback


def extract_retry_hint(feedback: str) -> str | None:
    match = re.search(r"try again in ([^.'\"}]+)", feedback, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def render_agent_result(agent: dict[str, Any]) -> None:
    name = agent.get("name") or agent.get("agentId", "Agent")
    score = agent.get("score", "n/a")
    feedback = str(agent.get("feedback", "No feedback returned."))

    with st.expander(f"{name} - score {score}", expanded=True):
        if is_rate_limit_error(agent):
            retry_hint = extract_retry_hint(feedback)
            message = "The LLM provider rate limit was reached."
            if retry_hint:
                message += f" Try again in {retry_hint}."
            st.error(message)
            st.caption("Retrieval may still work, but final agent writing needs available LLM tokens.")
            st.code(feedback[:2000], language="text")
            return

        if is_agent_error(agent):
            st.error("The agent backend returned an error.")
            st.code(feedback[:2000], language="text")
            return

        st.write(feedback)

        for title, key in (("Risks", "risks"), ("Recommendations", "recommendations"), ("Sources", "references")):
            values = agent.get(key) or []
            if not values:
                if key == "references":
                    st.warning("No validated retrieved-source references returned.")
                continue
            st.markdown(f"**{title}**")
            for item in values:
                st.write(f"- {item}")


def render_chunk(chunk: dict[str, Any], index: int) -> None:
    source = chunk.get("source_file", "unknown")
    page = chunk.get("page") or "n/a"
    distance = chunk.get("distance", "n/a")

    with st.expander(f"Chunk {index}: {source} p.{page} | distance {distance}"):
        st.write(chunk.get("text", ""))


def main() -> None:
    st.set_page_config(page_title="Civic Vision Agent Console", layout="wide")
    st.title("Civic Vision Agent Console")
    st.caption("Quickly test the deployed Render agent backend without using the React frontend.")

    with st.sidebar:
        st.header("Connection")
        api_url = clean_api_url(st.text_input("Agent API URL", value=DEFAULT_API_URL))
        timeout = st.slider("Request timeout seconds", min_value=10, max_value=180, value=90, step=10)
        bypass_proxy = st.checkbox(
            "Bypass system proxy",
            value=True,
            help="Keep this on if requests mention a proxy such as 127.0.0.1:9.",
        )

        if st.button("Check health", use_container_width=True):
            try:
                st.session_state["health"] = api_get(api_url, "/api/health", timeout, bypass_proxy)
                save_response_snapshot("health", st.session_state["health"])
            except Exception as error:
                show_request_error(error)

        health = st.session_state.get("health")
        if health:
            st.success(health.get("status", "health response received"))
            st.caption(f"LLM: {health.get('llm_model', 'unknown')}")
            st.caption(f"Embeddings: {health.get('embedding_model', 'unknown')}")

    evaluate_tab, retrieval_tab, raw_tab = st.tabs(["Evaluate", "Retrieval", "Raw JSON"])

    with evaluate_tab:
        st.subheader("Run all agents")

        example_name = st.selectbox("Load example", ["Custom", *EXAMPLE_PROPOSALS.keys()])
        apply_example(example_name)

        proposal = st.text_area(
            "Proposal",
            height=130,
            placeholder="Describe the civic intervention you want the agents to assess.",
            key="proposal_text",
        )
        hotspot_ids = [hotspot["id"] for hotspot in HOTSPOTS]
        selected_hotspot_id = st.selectbox(
            "Location",
            hotspot_ids,
            format_func=hotspot_label,
            key="selected_hotspot_id",
        )
        selected_hotspot = HOTSPOT_BY_ID[selected_hotspot_id]
        run_mode = st.radio(
            "Evaluation scope",
            ["One agent", "All agents"],
            horizontal=True,
            help="Use one agent while debugging to avoid spending five LLM calls per click.",
        )
        selected_agent = None
        if run_mode == "One agent":
            selected_agent = st.selectbox("Agent to run", list(AGENTS.keys()), format_func=lambda key: AGENTS[key])

        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            st.caption("Location sent to API")
            st.code(selected_hotspot["name"], language="text")
        with col2:
            st.caption("Hotspot ID")
            st.code(selected_hotspot["id"], language="text")
        with col3:
            st.caption("Type")
            st.code(selected_hotspot["type"], language="text")

        button_label = "Run selected agent" if run_mode == "One agent" else "Run 5-agent evaluation"
        if st.button(button_label, type="primary", use_container_width=True):
            if not proposal.strip():
                st.warning("Enter a proposal first.")
            else:
                payload = {
                    "proposal": proposal.strip(),
                    "location": selected_hotspot["name"],
                    "hotspot_id": selected_hotspot["id"],
                }
                with st.spinner("Running agents. Render free tier can take a moment after cold start."):
                    try:
                        path = f"/api/evaluate/{selected_agent}" if selected_agent else "/api/evaluate"
                        result = api_post(api_url, path, payload, timeout, bypass_proxy)
                        st.session_state["last_evaluation"] = result
                        save_response_snapshot("evaluation", result)
                    except Exception as error:
                        show_request_error(error)

        result = st.session_state.get("last_evaluation")
        if result:
            agents = result.get("agents", [])
            numeric_scores = [a.get("score") for a in agents if isinstance(a.get("score"), (int, float))]
            avg_score = sum(numeric_scores) / len(numeric_scores) if numeric_scores else 0

            metric_cols = st.columns(3)
            metric_cols[0].metric("Agents returned", len(agents))
            metric_cols[1].metric("Average score", f"{avg_score:.2f}" if numeric_scores else "n/a")
            metric_cols[2].metric("Validated references", sum(len(a.get("references") or []) for a in agents))

            for agent in agents:
                render_agent_result(agent)

    with retrieval_tab:
        st.subheader("Inspect retrieval before LLM")
        agent_id = st.selectbox("Agent", list(AGENTS.keys()), format_func=lambda key: AGENTS[key])
        query = st.text_area(
            "Retrieval query",
            height=100,
            placeholder="Example: shaded seating permit Placa Catalunya accessibility",
        )
        n_results = st.slider("Chunks", min_value=1, max_value=15, value=5)

        if st.button("Retrieve chunks", use_container_width=True):
            if not query.strip():
                st.warning("Enter a retrieval query first.")
            else:
                payload = {"query": query.strip(), "n_results": n_results}
                with st.spinner(f"Retrieving context for {AGENTS[agent_id]}..."):
                    try:
                        result = api_post(api_url, f"/api/retrieve/{agent_id}", payload, timeout, bypass_proxy)
                        st.session_state["last_retrieval"] = result
                        save_response_snapshot("retrieval", result)
                    except Exception as error:
                        show_request_error(error)

        retrieval = st.session_state.get("last_retrieval")
        if retrieval:
            chunks = retrieval.get("chunks", [])
            st.metric("Chunks returned", len(chunks))
            for index, chunk in enumerate(chunks, 1):
                render_chunk(chunk, index)

    with raw_tab:
        st.subheader("Latest API responses")
        st.markdown("**Evaluation**")
        st.json(st.session_state.get("last_evaluation", {}))
        st.markdown("**Retrieval**")
        st.json(st.session_state.get("last_retrieval", {}))
        st.markdown("**Health**")
        st.json(st.session_state.get("health", {}))


if __name__ == "__main__":
    main()
