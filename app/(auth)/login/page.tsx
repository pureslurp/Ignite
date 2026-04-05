"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/providers/auth-provider";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const { signIn, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  if (!loading && !isFirebaseConfigured()) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Configure Firebase</CardTitle>
          <CardDescription>
            Copy <code className="text-xs">.env.local.example</code> to{" "}
            <code className="text-xs">.env.local</code> and add your Firebase web
            app keys.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }

  async function onGoogle() {
    setPending(true);
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/80 shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex flex-col items-center gap-2">
          <Image
            src="/brand/ignite-logo.png"
            alt="Ignite"
            width={56}
            height={56}
            className="rounded-xl"
            priority
          />
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to track spending and fuel your FIRE journey.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-[#FFB800] to-[#FF4500] text-white hover:opacity-95"
            disabled={pending || loading}
          >
            Sign in
          </Button>
        </form>
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
            <span className="bg-card px-2">Or</span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogle}
          disabled={pending || loading}
        >
          Continue with Google
        </Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
