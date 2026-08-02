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
4. Wichtig: Wenn sich `firestore.rules` in diesem Repo mal ändert (z. B. nach einem Update der App), muss der neue Inhalt jedes Mal erneut hier eingefügt und veröffentlicht werden – eine Änderung im Repo allein reicht nicht, das Repo ist nur eine Kopie zur Dokumentation.

## 3. Admin-Login aktivieren (für euch beide)

1. Im Firebase-Menü: **Build → Authentication → Los geht's**.
2. Tab **Sign-in method** → **E-Mail/Passwort** aktivieren.
3. Tab **Users** → **Nutzer hinzufügen** → eure E-Mail-Adresse(n) und ein Passwort eintragen. Das ist der Login für den kleinen "Admin"-Button unten rechts in der App.

Ihr könnt hier auch zwei Nutzer anlegen (einen für Lucie, einen für Timmy). Hinweis: Der "Admin"-Button unten rechts ist standardmäßig nur sichtbar, wenn als Gast "Tim Hauviller" ausgewählt wurde, oder wenn man bereits eingeloggt ist (siehe `ADMIN_VISIBLE_FOR` in `app.js`, dort lassen sich weitere Namen ergänzen).

## 4. App veröffentlichen (GitHub Pages)

Da ihr die alte App auch mit GitHub gebaut habt, hier der gleiche Weg:

1. Neues Repository auf GitHub anlegen (öffentlich oder privat, beides geht).
2. Alle Dateien aus diesem Ordner ins Repository hochladen.
3. Im Repository: **Settings → Pages → Branch: main → Save**.
4. Nach ein paar Minuten ist die Seite unter `https://DEIN-GITHUBNAME.github.io/DEIN-REPO-NAME/` erreichbar. Das ist der Link, den ihr an eure Gäste schickt.

Tipp: Wenn ihr den Link "geheim" halten wollt, gebt dem Repository und der Seite KEINEN Namen wie "hochzeit-lucie-timmy", sondern etwas Unauffälliges/Zufälliges (z. B. `lt2027xk`), damit ihn niemand zufällig errät.

## 5. Erste Inhalte anlegen

1. Öffne die veröffentlichte Seite, wähle als Gast "Tim Hauviller" (oder einen anderen in `ADMIN_VISIBLE_FOR` eingetragenen Namen), klicke unten rechts auf **Admin** und logg dich mit dem Admin-Account ein.
2. Tab **Startseite**: Titel, Untertitel, Hintergrundbild, Fotostreifen-Bilder und Hochzeitsdatum eintragen, dann **Speichern**.
   - Für Fotos: Bild z. B. bei [imgur.com](https://imgur.com/upload) hochladen und den Bild-Link einfügen.
3. Tab **Design**: Akzent-, Haupt-, Hintergrund- und Textfarbe der App anpassen (optional).
4. Tab **Bereiche**: Klick auf **"Standard-Bereiche einfügen"**, um mit den drei vorgeschlagenen Ansichten zu starten ("Wichtige Infos", "Noch auszufüllen", "Tagesplan"). Ihr könnt beliebig weitere Bereiche hinzufügen, umbenennen, umsortieren oder löschen.
5. Tab **Kategorien**: Klick auf **"Standard-Kategorien einfügen"**, danach jede Kategorie einzeln bearbeiten: Bereich zuweisen, Typ wählen (Info-Text, Frage & Antwort, Formular, Checkliste, Tag im Tagesplan, Foto-Galerie), mit euren echten Infos befüllen, optional Bilder hinterlegen, und speichern. Reihenfolge könnt ihr mit den Pfeilen ändern.
6. Tab **Gästeliste**: alle Namen eurer Gäste eintragen. Jeder Gast wählt sich später beim Öffnen der Seite selbst aus dieser Liste aus.
7. Tab **Antworten**: hier seht ihr später alle Angaben eurer Gäste (Essen, Allergien, Checklisten-Fortschritt etc.), auch als CSV-Download für z. B. Excel.

## 6. Fotos hochladen aktivieren (optional, Firebase Storage)

Nur nötig, wenn ihr die Kategorie vom Typ "Foto-Galerie zum Hochladen" nutzen wollt, damit Gäste eigene Hochzeitsfotos direkt in der App hochladen können.

1. Im Firebase-Menü: **Build → Storage → Los geht's**. Falls gefordert, müsst ihr das Projekt auf den kostenpflichtigen **Blaze-Tarif** upgraden (nur Pay-as-you-go, für eine Hochzeits-Fotogalerie in der Regel wenige Cent bis Euro Kosten insgesamt) – dafür braucht ihr eine Zahlungsmethode bei Google.
2. Standort wählen (am besten den gleichen wie bei Firestore, z. B. `eur3`).
3. Danach oben auf **Regeln** klicken, den kompletten Inhalt aus der Datei `storage.rules` (in diesem Ordner) hineinkopieren und **Veröffentlichen** klicken.
4. Fertig – die Foto-Galerie-Kategorie funktioniert danach automatisch.

Wenn ihr das nicht einrichten wollt, funktioniert der Rest der App trotzdem ganz normal – nur die Foto-Galerie-Kategorie zeigt dann eine Fehlermeldung an, solange Storage nicht aktiviert ist.

## Wie die App aufgebaut ist

- **Startseite**: Foto, Hochzeitstitel, Countdown, Button "Los geht's".
- **Gast-Auswahl**: Gast wählt sich per Dropdown aus der Gästeliste aus (wird im Browser gemerkt).
- **Übersicht**: Gast wählt zwischen den von euch angelegten Bereichen (z. B. "Wichtige Infos", "Noch auszufüllen", "Tagesplan").
- **Bereichs-Ansicht**: aufklappbare Kategorien. Info- und Tagesplan-Kategorien zeigen Text, Frage-&-Antwort-Kategorien zeigen eine FAQ-Liste, Formular- und Checklisten-Kategorien lassen den Gast etwas eintragen bzw. abhaken (wird direkt gespeichert, Checklisten zeigen einen Fortschrittsbalken), Foto-Galerie-Kategorien lassen Gäste eigene Fotos hochladen.
- **Admin-Bereich**: nur mit Login erreichbar, zum Bearbeiten von Startseite, Design, Bereichen, Kategorien, Gästeliste und zum Einsehen aller Antworten.

Ihr könnt jederzeit neue Bereiche oder Kategorien hinzufügen, Reihenfolge ändern oder Formularfelder anpassen – alles über den Admin-Bereich, ohne Code.
