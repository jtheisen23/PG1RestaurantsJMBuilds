import { useState } from 'react';

// Renders the PG1 Restaurants logo from public/pg1-logo.png.
// If that file is missing, falls back to a plain text wordmark rather than
// showing a broken image, so the app still looks intentional either way.
export default function Logo({ className = '' }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`logo-fallback ${className}`.trim()}>
        PG<em>1</em>
      </span>
    );
  }

  return (
    <img
      src="/pg1-logo.png"
      alt="PG1 Restaurants"
      className={`logo ${className}`.trim()}
      onError={() => setFailed(true)}
    />
  );
}
