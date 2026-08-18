/**
 * Signed in or not, and nothing else.
 *
 * There is no router. The app is one page, and a second page would be a reason
 * to add one rather than a thing to plan for.
 */

import { useEffect, useState } from 'react';
import { supabase } from './lib/api';
import { SignIn } from './components/SignIn';
import { Dashboard } from './components/Dashboard';

type State =
  | { name: 'starting' }
  | { name: 'out' }
  | { name: 'in'; email: string }
  | { name: 'misconfigured'; problem: string };

export function App() {
  const [state, setState] = useState<State>({ name: 'starting' });

  useEffect(() => {
    let client;
    try {
      client = supabase();
    } catch (e) {
      setState({ name: 'misconfigured', problem: (e as Error).message });
      return;
    }

    // getSession first, so a reload with a live session does not flash the
    // sign-in form. onAuthStateChange then keeps up with signing in and out,
    // including a token that expires while the tab is open.
    client.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email;
      setState(email ? { name: 'in', email } : { name: 'out' });
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email;
      setState(email ? { name: 'in', email } : { name: 'out' });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  switch (state.name) {
    case 'starting':
      return null;

    case 'misconfigured':
      return (
        <main className="mx-auto mt-24 max-w-md px-4">
          <h1 className="mb-2 text-lg font-semibold">Not configured</h1>
          <p className="text-sm text-[var(--color-ink-quiet)]">{state.problem}</p>
        </main>
      );

    case 'out':
      return <SignIn />;

    case 'in':
      return (
        <Dashboard
          email={state.email}
          onSignOut={() => {
            void supabase().auth.signOut();
          }}
        />
      );
  }
}
