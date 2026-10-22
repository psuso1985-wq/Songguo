import { jsonResponse } from '../../../lib/json-response';
export const dynamic = 'force-dynamic';

export function GET() {
  const commit = process.env.APP_COMMIT;
  if (!commit || commit === 'unknown') {
    return jsonResponse({ error: 'APP_COMMIT is not configured for this build.' }, { status: 503 });
  }
  return jsonResponse({ commit });
}
