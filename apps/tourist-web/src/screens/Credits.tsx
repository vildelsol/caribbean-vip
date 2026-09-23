import { useNavigate } from 'react-router-dom';
import { DEMO_MEDIA_CREDITS } from '@cvip/demo';
import { Icon } from '../components/Icon';
import './Credits.css';

/**
 * Photograph credits.
 *
 * ## Why this screen exists
 *
 * 51 of the 57 photographs in the demo are CC BY or CC BY-SA, and both licences make naming the
 * author a condition of use — without it the app has no right to the images at all. The credit
 * used to be written across the bottom of every photograph, which is one reading of "wherever the
 * work appears" and a poor one: it put a stranger's name over the hero of a listing being sold.
 *
 * Neither licence asks for that. The wording is "in any reasonable manner", and a credits screen
 * is the ordinary reading of it — the same thing Wikipedia's own apps do. So the caption came off
 * the images and the obligation is discharged here, in full and per file: subject, author, licence
 * and the source page, so anyone can check the chain.
 *
 * **Do not remove this screen to tidy up the navigation.** It is the only place the attribution
 * now exists, and the photographs are only usable while it does.
 */
export function Credits() {
  const navigate = useNavigate();
  const entries = Object.entries(DEMO_MEDIA_CREDITS).sort((a, b) =>
    a[1].author.localeCompare(b[1].author),
  );

  return (
    <main className="screen credits">
      <header className="credits__head">
        <button
          type="button"
          className="credits__back"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <Icon name="chevron-left" size={20} color="var(--green-900)" strokeWidth={2.2} />
        </button>
        <h1 className="t-section credits__title">Photography</h1>
      </header>

      <p className="t-caption c-muted credits__intro">
        Every photograph in this app, with the photographer who took it and the licence it is used
        under. {entries.length} files. Most are Creative Commons, which asks that the author be
        named — this is where that is done.
      </p>

      <ul className="credits__list">
        {entries.map(([key, c]) => (
          <li key={key} className="credits__row">
            <p className="t-caption-strong credits__author">{c.author}</p>
            <p className="t-micro c-muted credits__subject">{c.subject}</p>
            <p className="t-micro credits__meta">
              <a href={c.licenceUrl} target="_blank" rel="noreferrer noopener" className="credits__link">
                {c.licence}
              </a>
              <span className="credits__dot" aria-hidden="true">
                ·
              </span>
              <a href={c.source} target="_blank" rel="noreferrer noopener" className="credits__link">
                Source
              </a>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
