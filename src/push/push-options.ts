export function parsePushCampaignOptions(args: string[]) {
  let limit = 50,
    apply = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true
    else if (args[i] === '--limit') limit = Number(args[++i])
    else throw new Error('Unknown campaign worker option')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error('Use --limit 1..200 [--apply]')
  return { limit, apply }
}
