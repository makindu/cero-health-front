
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@/components/feedback/spinner';
import { Button } from '@/components/ui/button';
import { OAUTH_CALLBACK_PATH, useAuth } from './cero-id';

function Screen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** Retour de CERO CEPATEC : échange le code contre un jeton puis revient à la page demandée. */
function Callback() {
  const { completeLogin, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    done.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (params.get('error') || !code || !state) {
      setError('La connexion a été refusée ou interrompue.');
      return;
    }

    completeLogin(code, state)
      .then((returnTo) => window.location.replace(returnTo))
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : 'Échec de la connexion.',
        ),
      );
  }, [completeLogin]);

  if (error) {
    return (
      <Screen title="Connexion impossible">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => void login('/')}>
          Réessayer
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Connexion en cours…">
      <Spinner />
    </Screen>
  );
}

/**
 * Protège l'espace hospitalier.
 * Le Centre d'aide reste accessible sans authentification.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const {
    status,
    activeFacility,
    facilities,
    login,
    logout,
    user,
  } = useAuth();

  const pathname = window.location.pathname;

  // Callback OAuth : traitement prioritaire.
  if (pathname === OAUTH_CALLBACK_PATH) {
    return <Callback />;
  }

  // Route publique : Centre d'aide.
  // Aucune session ni aucun établissement ne sont requis.
  if (pathname === '/help') {
    return <>{children}</>;
  }

  // Vérification de la restauration de session.
  if (status === 'loading') {
    return (
      <Screen title="CERO HEALTH">
        <Spinner />
      </Screen>
    );
  }

  // Utilisateur non connecté.
  if (status === 'anonymous') {
    return (
      <Screen title="CERO HEALTH">
        <p className="text-sm text-muted-foreground">
          Connectez-vous avec votre compte CERO CEPATEC.
        </p>

        <Button
          onClick={() =>
            void login(pathname + window.location.search)
          }
        >
          Se connecter avec CERO CEPATEC
        </Button>
      </Screen>
    );
  }

  // Utilisateur connecté sans établissement autorisé.
  if (!activeFacility) {
    return (
      <Screen title="Aucun accès à CERO HEALTH">
        <p className="text-sm text-muted-foreground">
          {user ? `${user.name}, v` : 'V'}otre compte n’a accès à CERO HEALTH dans aucun établissement.
          {facilities.length > 0
            ? ' Demandez au propriétaire de l’établissement de vous affecter l’application.'
            : ''}
        </p>

        {facilities
          .filter((facility) => facility.reason)
          .map((facility) => (
            <p
              key={facility.id}
              className="text-xs text-muted-foreground"
            >
              {facility.name} : {facility.reason}
            </p>
          ))}

        <Button
          variant="outline"
          onClick={() => void logout()}
        >
          Se déconnecter
        </Button>
      </Screen>
    );
  }

  // Accès autorisé à l'application.
  return <>{children}</>;
}
