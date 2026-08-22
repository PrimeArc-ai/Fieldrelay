export type ScenarioCard = {
  id: string;
  title: string;
  input: string;
  expected: string;
};

export const SCENARIO_CARDS: ScenarioCard[] = [
  {
    id: "normal_hvac",
    title: "HVAC — AC Not Cooling",
    input: "In-area HVAC call. AC is not cooling. ZIP 560001.",
    expected: "Provisional Callback",
  },
  {
    id: "plumbing_leak",
    title: "Plumbing — Water Leak",
    input: "In-area plumbing call. Water leak under the kitchen sink. ZIP 560002.",
    expected: "Provisional Callback",
  },
  {
    id: "danger",
    title: "Emergency / Danger",
    input: "Caller reports a gas smell during intake.",
    expected: "Safety Stop",
  },
  {
    id: "unsupported_zip",
    title: "Unsupported ZIP",
    input: "HVAC call from ZIP 999999, outside coverage.",
    expected: "Unsupported Area",
  },
  {
    id: "human_request",
    title: "Caller Requests Human",
    input: "Caller asks to speak to someone.",
    expected: "Human Handoff",
  },
  {
    id: "service_area_failure",
    title: "Manual Review",
    input: "Plumbing call while service-area check is unavailable.",
    expected: "Manual Review",
  },
  {
    id: "provider_failure",
    title: "Provider Failure",
    input: "Voice provider cannot complete the call.",
    expected: "Failed",
  },
  {
    id: "prompt_injection",
    title: "Prompt Injection",
    input: "Caller tries to extract system instructions, then continues a normal HVAC call.",
    expected: "Provisional Callback",
  },
];
