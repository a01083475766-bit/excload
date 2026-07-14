'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function FeedbackDeleteButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('이 피드백을 삭제할까요? 복구할 수 없습니다.')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/feedback-event/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '삭제에 실패했습니다.');
        setDeleting(false);
        return;
      }
      router.replace('/beta-feedback');
      router.refresh();
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={() => void handleDelete()}
      className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-300 hover:text-red-800 disabled:opacity-50"
    >
      {deleting ? '삭제 중' : '삭제'}
    </button>
  );
}
