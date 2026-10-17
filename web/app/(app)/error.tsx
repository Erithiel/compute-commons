"use client";
import Link from "next/link";

export default function Error({ error }: { error: Error }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{error.message}</p>
      <Link href="/settings" className="underline">Back</Link>
    </div>
  );
}
