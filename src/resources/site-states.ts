export const SITE_STATES_CONTENT = `
Publisher Site Lifecycle States:
  oninit      -> Site created, awaiting verification setup
  onconfirm   -> Verification code placed, awaiting check
  onstat      -> Collecting initial statistics
  onmoderate  -> Under moderation review
  accepted    -> Approved, ads serving
  deny        -> Rejected by moderation (can resubmit)
  freeze      -> Temporarily frozen (policy violation or inactivity)
`;
