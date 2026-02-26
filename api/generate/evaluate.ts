/* -----------------------------------------------------------------------
   POST /api/generate/evaluate
   Body: { proposalId, spaceId, promptText, generatedImageUrl, language }
   Returns: { evaluations: AgentFeedback[] }
   Spawns 5 OpenAI Assistants in parallel — each has its own knowledge base.
   TODO: Connect to OpenAI Assistants API.
   ----------------------------------------------------------------------- */

import type { VercelRequest, VercelResponse } from '../_types';

const AGENT_IDS = ['budget', 'heritage', 'safety', 'sociologist', 'regulations'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { proposalId, spaceId, promptText } = req.body ?? {};

  if (!proposalId || !spaceId || !promptText) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // TODO: Run 5 OpenAI Assistants in parallel:
  //
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  //
  // const agentAssistantIds: Record<string, string> = {
  //   budget:       process.env.OPENAI_ASSISTANT_BUDGET_ID!,
  //   heritage:     process.env.OPENAI_ASSISTANT_HERITAGE_ID!,
  //   safety:       process.env.OPENAI_ASSISTANT_SAFETY_ID!,
  //   sociologist:  process.env.OPENAI_ASSISTANT_SOCIOLOGIST_ID!,
  //   regulations:  process.env.OPENAI_ASSISTANT_REGULATIONS_ID!,
  // };
  //
  // const evaluations = await Promise.all(
  //   AGENT_IDS.map(async (agentId) => {
  //     const thread = await openai.beta.threads.create();
  //     await openai.beta.threads.messages.create(thread.id, {
  //       role: 'user',
  //       content: `Space: ${spaceId}\nProposal: ${promptText}\nLanguage: ${language}\n
  //         Please evaluate this urban planning proposal. Return JSON: { score: 1-5, feedback: string }`,
  //     });
  //     const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
  //       assistant_id: agentAssistantIds[agentId],
  //     });
  //     // parse response...
  //   })
  // );

  void AGENT_IDS; // suppress unused warning until implemented

  return res.status(501).json({
    success: false,
    error: 'Not yet implemented — connect OpenAI Assistants API first',
  });
}
