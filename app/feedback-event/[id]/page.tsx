import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FeedbackPostDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/beta-feedback/${id}`);
}
