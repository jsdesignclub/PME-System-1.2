/**
 * The page around `NewMailForm`.
 *
 * Thin on purpose. The form owns its fields, its validation, its upload progress
 * and its own post-filing confirmation — including the issued day stamp, which it
 * shows rather than navigates past, because a stamp that appears and vanishes in
 * a redirect is a stamp the clerk never learns.
 *
 * This page's only jobs are the title, the way back, and the one decision the
 * form cannot make: where the user goes once they have read the stamp. Straight
 * to the letter, replacing this route, so Back does not return to a filled-in
 * form for a letter that has already been filed — re-submitting it would create a
 * second letter with a second day stamp, which is the exact duplicate D53's
 * server-side allocation exists to make possible only once.
 */
import { Link, useNavigate } from 'react-router-dom';

import { useLanguage } from '../context/LanguageContext.jsx';
import { NewMailForm } from '../components/forms/NewMailForm.jsx';

export default function NewMailPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t('new.title')}</h1>
        <Link to="/mail" className="text-sm font-medium text-ink underline hover:text-brand">
          {t('new.backToRegistry')}
        </Link>
      </div>

      <NewMailForm onCreated={(letter) => navigate(`/mail/${letter.id}`, { replace: true })} />
    </div>
  );
}
