import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
        <span className="text-3xl">🔍</span>
      </div>
      <h1 className="text-2xl font-bold mb-2">404 — Not Found</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
        The page you're looking for doesn't exist.
      </p>
      <Link href="/">
        <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors">
          Go Home
        </button>
      </Link>
    </div>
  );
}
