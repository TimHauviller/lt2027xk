# Hochzeits-App Lucie & Timmy

So richtest du die App ein. Dauert insgesamt ca. 20–30 Minuten, du brauchst nur einen Google-Account.

## 1. Firebase-Projekt anlegen

1. Gehe auf [console.firebase.google.com](https://console.firebase.google.com) und logg dich mit eurem Google-Account ein.
2. Klicke auf **"Projekt hinzufügen"**, gib z. B. `lucie-timmy-hochzeit` als Namen ein, Google Analytics kannst du deaktivieren.
3. Wenn das Projekt fertig erstellt ist, klicke im Projekt-Dashboard auf das Web-Symbol `</>`, um eine neue Web-App zu registrieren. Name z. B. "Hochzeit". **Firebase Hosting** brauchst du nicht anzuhaken.
4. Du bekommst danach einen Codeblock mit `const firebaseConfig = { ... }`. Kopiere die Werte (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) in die Datei `firebase-config.js` in diesem Projektordner – einfach die Platzhalter ersetzen.

## 2. Datenbank aktivieren (Firestore)

1. Im Firebase-Menü links: **Build → Firestore Database → Datenbank erstellen**.
2. Modus: **"Produktionsmodus"** wählen, Standort z. B. `eur3 (europe-west)`.
3. Wenn die Datenbank erstellt ist, oben auf **Regeln** klicken, den kompletten Inhalt aus der Datei `firestore.rules` (in diesem Ordner) hineinkopieren und **Veröffentlichen** klicken.

## 3. Admin-Login aktivieren (für euch beide)

1. Im Firebase-Menü: **Build → Authentication → Los geht's**.
2. Tab **Sign-in method** → **E-Mail/Passwort** aktivieren.
3. Tab **Users** → **Nutzer hinzufügen** → eure E-Mail-Adresse(n) und ein Passwort eintragen. Das ist der Login für den kleinen "⚙"-Button unten rechts in der App.

Ihr könnt hier auch zwei Nutzer anlegen (einen für Lucie, einen für Timmy).

## 4. App veröffentlichen (GitHub Pages)

Da ihr die alte App auch mit GitHub gebaut habt, hier der gleiche Weg:

1. Neues Repository auf GitHub anlegen (öffentlich oder privat, beides geht).
2. Alle Dateien aus diesem Ordner (`index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`) ins Repository hochladen.
3. Im Repository: **Settings → Pages → Branch: main → Save**.
4. Nach ein paar Minuten ist die Seite unter `https://DEIN-GITHUBNAME.github.io/DEIN-REPO-NAME/` erreichbar. Das ist der Link, den ihr an eure Gäste schickt.

Tipp: Wenn ihr den Link "geheim" halten wollt, gebt dem Repository und der Seite KEINEN Namen wie "hochzeit-lucie-timmy", sondern etwas Unauffälliges/Zufälliges (z. B. `lt2027xk`), damit ihn niemand zufällig errät.

## 5. Erste Inhalte anlegen

1. Öffne die veröffentlichte Seite, klicke unten rechts auf **⚙** und logg dich mit dem Admin-Account ein.
2. Tab **Startseite**: Titel, Untertitel, Foto-URL und Hochzeitsdatum eintragen, dann **Speichern**.
   - Für das Foto: Bild z. B. bei [imgur.com](https://imgur.com/upload) hochladen und den Bild-Link einfügen.
3. Tab **Kategorien**: Klick auf **"Standard-Kategorien einfügen"**, um mit den 10 vorgeschlagenen Kategorien zu starten (Kleidermodus, Anreise, Essen & Getränke, usw.). Danach jede Kategorie einzeln bearbeiten, mit euren echten Infos befüllen und speichern. Reihenfolge könnt ihr mit den Pfeilen ändern.
4. Tab **Gästeliste**: alle Namen eurer Gäste eintragen. Jeder Gast wählt sich später beim Öffnen der Seite selbst aus dieser Liste aus.
5. Tab **Antworten**: hier seht ihr später alle Angaben eurer Gäste (Essen, Allergien, Getränke etc.), auch als CSV-Download für z. B. Excel.

## Wie die App aufgebaut ist

- **Startseite**: Foto, Hochzeitstitel, Countdown, Button "Los geht's".
- **Gast-Auswahl**: Gast wählt sich per Dropdown aus der Gästeliste aus (wird im Browser gemerkt).
- **Hauptseite**: aufklappbare Kategorien. Info-Kategorien zeigen nur Text, Formular-Kategorien (z. B. "Essen & Getränke") lassen den Gast etwas eintragen – wird direkt gespeichert.
- **Admin-Bereich**: nur mit Login erreichbar, zum Bearbeiten von Startseite, Kategorien, Gästeliste und zum Einsehen aller Antworten.

Ihr könnt jederzeit neue Kategorien hinzufügen, Reihenfolge ändern oder Formularfelder anpassen – alles über den Admin-Bereich, ohne Code.
