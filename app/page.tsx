'use client';

import dynamic from 'next/dynamic';

const Camera = dynamic(() => import('./Camera'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">
      <Camera />
    </main>
  );
}
