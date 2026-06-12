import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-gray-200">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-gray-900">Page not found</h2>
      <p className="mt-2 text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-4">
        <Link
          href="/"
          className="rounded-lg bg-terra px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terraDark"
        >
          Explore Art
        </Link>
        <Link
          href="/partners"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Browse Galleries
        </Link>
      </div>
    </div>
  );
}
