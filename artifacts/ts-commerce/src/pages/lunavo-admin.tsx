import Admin from './admin';

/**
 * The cinematic Lunavo shell must not replace the operational admin console.
 * Keep the existing data-backed admin surface as the canonical implementation.
 * The Admin component owns real queries, review mutations, audit-sensitive actions,
 * and the server-enforced administrator boundary.
 */
export default function LunavoAdmin() {
  return <Admin />;
}
