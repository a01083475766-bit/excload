'use client';

import { useEffect, useState } from 'react';

interface AbuseUser {
  id: string;
  email: string;
  deviceId: string | null;
  lastIp: string | null;
  abuseScore: number;
  abuseReason: string | null;
  createdAt: string;
}

export default function AbusePage() {
  const [users, setUsers] = useState<AbuseUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = () => {
    setIsLoading(true);
    fetch('/api/akman/abuse-users')
      .then((res) => res.json())
      .then((data) => setUsers(data || []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const action = async (userId: string, type: 'block' | 'unblock' | 'removePoints') => {
    await fetch('/api/akman/user-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        action: type,
      }),
    });

    fetchUsers();
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">🚨 어뷰저 감지</h1>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">Email</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">Device</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">IP</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">Score</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">이유</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">
                  감지된 어뷰저가 없습니다.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100">
                <td className="px-3 py-2 text-zinc-800">{u.email}</td>
                <td className="px-3 py-2 text-zinc-600">{u.deviceId ?? '-'}</td>
                <td className="px-3 py-2 text-zinc-600">{u.lastIp ?? '-'}</td>
                <td className="px-3 py-2 text-red-500 font-bold">{u.abuseScore}</td>
                <td className="px-3 py-2 text-xs text-zinc-700 whitespace-pre-line">
                  {u.abuseReason ?? '-'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => action(u.id, 'block')}
                      className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                    >
                      차단
                    </button>
                    <button
                      onClick={() => action(u.id, 'removePoints')}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs"
                    >
                      사용량 제거
                    </button>
                    <button
                      onClick={() => action(u.id, 'unblock')}
                      className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs"
                    >
                      복구
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

