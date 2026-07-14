import { redirect } from 'next/navigation';

export default function LegacyFeedbackRedirectPage() {
  redirect('/beta-feedback');
}
