# Synchronisation cabinet — mise en place du backend (Supabase)

Objectif : sauvegarder les simulations hors du navigateur et les partager
entre les associés. Connexion par **code à 6 chiffres reçu par e-mail**
(aucun mot de passe), données hébergées en **Union européenne**, comptes
créés **par invitation uniquement**.

Durée : ~10 minutes, une seule fois. Tout est gratuit (free tier).

---

## 1. Créer le projet Supabase

1. Aller sur **https://supabase.com** → *Start your project* → se connecter
   avec le compte **GitHub** (adrienvizuete-jpg).
2. *New project* :
   - **Name** : `auxy-finance-lab`
   - **Database password** : en générer un et le ranger dans le gestionnaire
     de mots de passe (il ne sert que pour l'administration, jamais pour l'app)
   - **Region** : `Central EU (Frankfurt)` — données en UE
3. Attendre ~2 minutes que le projet soit provisionné.

## 2. Créer la table et les règles d'accès

Menu **SQL Editor** → *New query* → coller tel quel → **Run** :

```sql
-- Table des simulations partagées du cabinet
create table public.dossiers (
  id          text primary key,
  name        text,
  type        text,
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.dossiers enable row level security;

-- Accès réservé aux comptes e-mail du cabinet (créés par invitation)
create policy "cabinet select" on public.dossiers
  for select using (auth.jwt() ->> 'email' like '%@auxy-partners.com');

create policy "cabinet insert" on public.dossiers
  for insert with check (auth.jwt() ->> 'email' like '%@auxy-partners.com');

create policy "cabinet update" on public.dossiers
  for update using (auth.jwt() ->> 'email' like '%@auxy-partners.com')
  with check (auth.jwt() ->> 'email' like '%@auxy-partners.com');

-- Pas de policy DELETE : aucune suppression possible depuis l'app.
```

## 3. Verrouiller les inscriptions et inviter les associés

1. **Authentication → Sign In / Up** (ou *Providers* selon la version) :
   - décocher **Allow new users to sign up** (les comptes ne se créent que
     par invitation).
2. **Authentication → Users** → *Add user* → *Send invitation* :
   - `adrien.vizuete@auxy-partners.com`
   - `yannick.rousset@auxy-partners.com`
   (l'e-mail d'invitation peut être ignoré — c'est la création du compte
   qui importe, la connexion se fera par code depuis l'app)

## 4. Faire apparaître le code à 6 chiffres dans l'e-mail

**Authentication → Emails** (Email Templates) → onglet **Magic Link** :
remplacer le contenu par (ou simplement ajouter la ligne du code) :

```html
<h2>Connexion Auxy Finance Lab</h2>
<p>Votre code de connexion :</p>
<h1 style="letter-spacing:6px">{{ .Token }}</h1>
<p>Ce code expire dans une heure. Si vous n'êtes pas à l'origine de cette
demande, ignorez ce message.</p>
```

## 5. Brancher l'app

**Project Settings → Data API** : copier

- **Project URL** (forme `https://xxxx.supabase.co`)
- **anon / public key** (clé publique — elle est faite pour être embarquée
  dans l'app ; la sécurité vient des règles SQL de l'étape 2)

puis renseigner `data/cloud-config.json` :

```json
{
  "url": "https://xxxx.supabase.co",
  "anonKey": "eyJ..."
}
```

et committer/pousser (ou transmettre les deux valeurs à l'assistant qui
s'en charge).

## 6. Anti-pause (déjà câblé)

Le free tier met un projet en pause après 7 jours sans requête. Le workflow
`veille.yml` contient déjà une étape de ping quotidien : il suffit d'ajouter
deux secrets GitHub au dépôt (*Settings → Secrets and variables → Actions*) :

- `SUPABASE_URL` = la Project URL
- `SUPABASE_ANON_KEY` = l'anon key

## Utilisation

Onglet **Historique** de l'app → carte « Synchronisation cabinet » :
saisir son e-mail → *Recevoir un code* → saisir le code → connecté.
Ensuite : **Envoyer vers le cloud** (push) / **Récupérer du cloud** (pull).
La fusion se fait par identifiant, la version la plus récente gagne,
rien n'est jamais effacé côté serveur depuis l'app.
