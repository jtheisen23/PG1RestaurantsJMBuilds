import { useMemo } from 'react';
import { TOP_BRANDS, brandKeyFor, rootBrandFor, templateFor, overallProgress, pct } from '../lib/helpers';

// The landing view of the Projects tab. PG1 develops more than one brand and
// each has its own checklist, so the first choice is which brand you are
// working on; the project list underneath is unchanged.
export default function BrandPicker({ projects, onSelectBrand }) {
  const summary = useMemo(() => {
    const byBrand = {};
    TOP_BRANDS.forEach((b) => {
      byBrand[b.key] = { active: 0, completed: 0, progressSum: 0 };
    });
    // A project on one of a brand's other tracks -- an acquisition, say --
    // counts towards that brand's card, since the card is the way in to it.
    // Progress is a fraction of each project's own checklist, so averaging
    // across tracks still means something.
    projects.forEach((p) => {
      const row = byBrand[rootBrandFor(brandKeyFor(p)).key];
      if (!row) return;
      if (p.completed) row.completed++;
      else {
        row.active++;
        row.progressSum += overallProgress(p);
      }
    });
    return byBrand;
  }, [projects]);

  return (
    <>
      <div className="brand-grid">
        {TOP_BRANDS.map((b) => {
          const s = summary[b.key];
          const tpl = templateFor(b.key);
          const avg = s.active ? s.progressSum / s.active : 0;
          return (
            <button key={b.key} className="brand-card" onClick={() => onSelectBrand(b.key)}>
              <div className={`brand-mark ${b.key}`} aria-hidden="true">
                {b.initials}
              </div>
              <div className="brand-body">
                <div className="brand-name">{b.name}</div>
                <div className="brand-counts">
                  {s.active} active
                  {s.completed > 0 && <span className="muted"> · {s.completed} completed</span>}
                </div>
                {s.active > 0 && (
                  <div className="brand-rail">
                    <div className="fill" style={{ width: `${pct(avg)}%` }} />
                  </div>
                )}
                <div className="brand-note">
                  {tpl.isEmpty
                    ? 'Checklist not loaded yet'
                    : s.active || s.completed
                      ? `${pct(avg)}% average progress`
                      : 'No projects yet'}
                </div>
              </div>
              <span className="brand-chev">&#9656;</span>
            </button>
          );
        })}
      </div>

      <div className="footer-note">
        Each brand has its own checklist, so a project's progress is measured against the checklist
        for its brand. Projects imported before brands existed are Jersey Mike's.
      </div>
    </>
  );
}
