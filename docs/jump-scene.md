# Scena skoku (v2.10P)

Jak oryginał rysuje skocznię i tło (0baf:344c, tablice z 0baf:1e89) i jak robi to port: `src/render/jump-view-scene.ts`
oraz moduły `scene-*.ts` i `hill-layer-tables.ts`. Dane każdej skoczni: `hill-format.md`, figura skoczka:
`jumper-figure.md`.

## Rzut: warstwy w perspektywie

Oryginał nie ma jednego rzutu sceny. Rysuje ją z warstw 1..24, każda w skali `p` (tablica Single pod `DS:14EE`;
port: `LAYER_SCALE`), wokół punktu zbiegu blisko górnego brzegu ekranu:

```
X = 160 + p·(14·(x − x_skoczka) − 9)
Y = 12 + p·(14·200/240·(y_skoczka − y) + 58)
```

Dalekie warstwy (`p` < 1) przesuwają się wolno, bliskie szybko. Warstwy samej skoczni:

| Warstwa | p | Co leży |
|---|---|---|
| 17 | 0,933 | dalsza krawędź zeskoku i dalszy płot |
| 19 | 1,182 | dalsza strona rynny najazdu |
| 20 | 1,33 | płaszczyzna skoczka (ślady nart, cień, belka) |
| 21 | 1,52 | bliższa strona rynny najazdu i bliższa ściana |
| 23 | 2,313 | bliższa krawędź zeskoku i bliższy płot |

Zeskok jest więc pasem między dwiema kopiami tego samego profilu w różnych skalach, a linie odległości łączą
ten sam punkt profilu na warstwie 17 i na warstwie 23. Pochylenie linii zależy od tego, jak daleko przed albo
za kamerą leży punkt: linia pod kamerą jest pionowa, przed nią pochyla się w prawo, za nią w lewo.

Kamera: `camX = 14·x_skoczka + 9`, `camY = 14·200/240·y_skoczka + 70` (przesunięcia `DS:4D36`, `4D3A` działają
tylko w kamerach studia powtórek). Przesunięcie warstwy: `trunc(p·camX)` i `trunc(p·camY − 12·(p − 1))`.
Tablica warstwy: indeks `j` to `x = (j − 160)/(14·p)`, wartość to `−round(14·p·h(x)·200/240)`; kolumna ekranu
`sx` pokazuje indeks `przesunięcie + sx`.

Figura skoczka ma skalę 1 (14 px/m), a stoi w miejscu warstwy 20: stopa w kolumnie 148, w wierszu 87.

## Kolejność rysowania

Scena składa się z kolumn: procedura 0baf:2f7f wypełnia odcinek kolumny indeksami palety od jednego do drugiego
(wartości 8.8; krok to różnica przez liczbę wierszy, pierwszy wiersz dostaje już jeden krok).

1. Niebo: 16 pasów po 3 wiersze, indeksy 240..255, nieruchome.
2. Tło: pasy śniegu między warstwami 1, 2, 4, 7, 11 i 17 (każdy ucięty dalszą krawędzią zeskoku), między nimi
   drzewa warstw 1..16.
3. Zeskok: od warstwy 17 do 23, kolory `20·cos(atan(14·nachylenie)) + 32` i `15·cos(...) + 48`.
4. Linie: co 5 m od `4648` (zielone, indeks 84), punkt K (czerwona, 75), rekord skoczni (niebieska, 107).
   Miejsce: punkt profilu po łuku od progu o odległość + 0,15 m (rekord + 0,25 m), 1eee:08fb.
5. Dalszy płot: 5 wierszy nad warstwą 17, słupek co 60 indeksów; od progu + 1 m + `4651`.
6. Podpory najazdu, potem rynna (dalsza listwa, tor, platforma startowa z tylną ścianą, koniec toru z czołem
   progu), ślady nart (przyciemnione indeksy śniegu dwa wiersze nad i pod linią skoczka).
7. Cień, dalsza połowa belki, skoczek, bliższa połowa belki.
8. Bliższa ściana rynny (przed skoczkiem), bliższy płot (11 wierszy nad warstwą 23, słupek co 130 indeksów),
   śnieg przed bliższą krawędzią.

## Paleta

Budowana wzorem (003f:9df1): 13 ramp od czarnego przez barwę do bieli; środek rampy przesunięty ku szarości
(`c·0,85 + suma·0,05` w arytmetyce 80-bitowej oryginału, z zaokrągleniem połówek do parzystej). Od skoczni
zależy tylko niebo (003f:9da5): wpisy 241..255 przechodzą do koloru nieba skoczni. Port: `scene-palette.ts`.

## Tło

Pięć warstw tła miesza profil skoczni z falami sinusów (0baf:1c31: 5 zestawów po 4 fale z ziarna skoczni;
oryginał liczy też średnie fazy i częstotliwości, po czym od razu je nadpisuje nowymi losowaniami):

| Warstwa | Wysokość | Kolor |
|---|---|---|
| 1 | 0,03·profil + 0,97·(fale 1 + D) | stały, 62 → 58 |
| 2 | 0,4·profil + 0,6·(fale 2 + D) | stały, 58 |
| 4 | 0,6·profil + 0,4·(fale 3 / 1,5 + D) | `8·cos(...) + 46` |
| 7 | 0,8·profil + 0,2·(fale 4 / 2,5 + D) | `12·cos(...) + 38` |
| 11 | 0,95·profil + 0,05·(fale 5 / 2,5 + D) | `18·cos(...) + 34` |

`D` to wysokość bazowa `464E`.

## Drzewa

0baf:602e rozstawia raz na skocznię, z jej ziarna, świerki i sosny na warstwach 2..15 (rozmiar `t` od 2 do 12,
na warstwach 12..15 największy), najwyżej 20 na warstwę; od 30 m przed progiem do 20 m za nim tylko na
warstwach poniżej 11. Wysokość podstawy: tablica warstwy albo mieszanka dwóch sąsiednich tablic kluczowych
według `p`. Oryginał rysuje bitmapy z `Dsj.dat` (zasoby 100..121), jedną na rozmiar.

Port rysuje własne drzewa (`tree-bitmaps.ts`) w tych samych miejscach i rozmiarach: świerki z opadającymi
piętrami gałęzi i sosny z gołym pniem (pomarańczowym w koronie) pod koroną z płaskich kęp; śnieg na wierzchu
gałęzi; cztery kształty każdego rozmiaru, wybierane według miejsca drzewa; dalekie sosny ze zwartą koroną.
Na warstwach 2..10 część drzew oryginału dostaje kępę sąsiadów tego samego gatunku (`scene-trees.ts`,
`sceneTrees`), a drzewa dalszych warstw lekko bledną ku kolorowi śniegu (do 20 % na najdalszej warstwie,
bez zmiany od `p` = 0,35).

## HUD

Ramka wiatru (0baf:3389) i sygnalizator startu mają wymiary i kolory bitmap oryginału (zasoby 11 i 13 z `Dsj.dat`),
rysowane przez port (`jump-view-hud.ts`):

- Strzałka (1cb6:1ee9): środek w (13, 8) ramki, ogon i grot w `±(11 cos a, 5,5 sin a)`, wąsy do
  `(8 cos(a ± 1,25), 4 sin(a ± 1,25))`, `a` to kierunek wskaźnika; najpierw cień kolorem 0x44 o wiersz niżej, potem
  0x47, linie pędzlem 2x2. Dodatni `sin a` to grot w dół: składowa poprzeczna wiatru (bez wpływu na skoczka) leży
  w głąb sceny, ściśnięta o połowę. Śnieg idzie za tym samym wektorem (`game/wind-display.ts`).
- Rękawy wiatru (dodatek portu) biorą ten sam kierunek wskaźnika i prędkość, ale jako stożek w świecie: z siłą
  wiatru podnoszą się od zwisu ku poziomowi (pełny przy 4,5 m/s), zawsze z lekkim opadaniem materiału (0,25 długości
  poziomej). Część w poprzek skoczni jest skrócona do 0,15 i rysowana w górę ekranu, gdy rękaw wskazuje od widza,
  w dół, gdy ku niemu; opadanie jest większe od tego wzniesienia, więc rękaw nigdy nie staje ponad poziom i nie
  przeskakuje z dołu do góry. Widoczna długość ma dolną granicę 0,4, więc rękaw oglądany od czoła jest krótkim
  kikutem z kierunkiem, a przy czystym wietrze bocznym nie zwisa jak w ciszy.
- Sygnalizator (0baf:5581), póki skoczek stoi na belce: czerwone, gdy odliczanie jeszcze nie ruszyło (16 s);
  zielone od 15 s; od 10 s zielone miga (zapalone, gdy klatka mod 70 < 25); po przekroczeniu czasu znów czerwone.
- Noty: ramki 27x11 od wiersza 57 co 12 wierszy, tekst 2 piksele od lewego brzegu ramki, wyrównany do prawej
  w polu 4 znaków jak `Str(note:4:1)` (8,0 stoi pod 0 i 5 z 10,0); do 45 klatek po ostatniej wszystkie
  przygaszone (0xC7), potem liczone jasne (0xCC), odrzucone przygaszone.
- Pasek: 13 wierszy (górna linia 0x11, lewa kolumna 0x0A, wypełnienie 0x05, dolna linia 0x08), teksty 5 pikseli od
  brzegu i 3 wiersze pod górną linią, kolorem 0x79; po skoku odległość z małym „m” od 47% szerokości (kolumna 150
  z 320) w polu 5 znaków wyrównanym do prawej, jak `Str(x:5:1)` oryginału (na jego zrzucie 89,5 m zaczyna się
  w kolumnie 156). Punkty oryginał pisze od kolumny 248 w polu 7 znaków (128,5 zaczyna się w kolumnie 260); port
  kończy je przy prawym brzegu paska, 5 pikseli od niego, tam gdzie przed lądowaniem stała prędkość, bo na
  szerszym widoku kolumna 248 z 320 zostawiała je w połowie pustej części paska.
- Liczby w obrazie (odległość, punkty, noty, prędkość, wiatr) port pisze z przecinkiem dziesiętnym, jak ekrany
  gry i polska pisownia; oryginał pisze kropkę. Za punktami stoi „pkt”, żeby nie brać ich za drugą odległość,
  a prędkość ma jednostkę „km/h”; obie małymi literami, jak małe „m” oryginału po odległości. Każdą jednostkę
  od liczby dzieli ten sam wąski odstęp (spacja U+2009, 2 piksele), a małe litery stoją ciaśniej niż wersaliki
  (szerokość litery i piksel odstępu); oryginał pisze „m” tuż za liczbą.

Czcionka (`pixel-font.ts`) jest własna, w stylu oryginału, a każdy kształt jest zaprojektowany na nowo (porównanie
z czcionką oryginału przy każdym przesunięciu w komórce: zgodne są tylko spacja, kropka i dwukropek, a żaden inny
znak nie różni się od niej o jeden piksel; wykrzyknik, później wyprostowany do pionowej kreski z kropką, bo
skośny z daleka przypominał znak zapytania, i małe k, p, t, h, dodane później, nie były z nią porównane). Znak ma ciało 5x6 z pionowymi kreskami szerokości 2 px i cień: piksel
pusty pod pikselem ciała jest cieniem, więc cień wypełnia wnętrza liter, wewnętrzne narożniki i siódmy wiersz pod
literą. Każdy znak zajmuje 5 kolumn i 1 kolumnę odstępu, jak w oryginale. Kolor z rampy palety jak w oryginale:
indeks = wartość - 7 + rampa + `(2 wiersz + kolumna) div 6` (wiersz 1..7, kolumna 1..5; ciało ma wartość 6, cień 1),
więc ciało to rampa - 1, cień rampa - 6, oba jaśniejsze ku prawemu dolnemu rogowi. Przy jednolitym kolorze cień ma
połowę jego jasności.

Zestaw: A..Z, 0..9, `. , : ; / + - = ! ? ( ) ' " % ·`, spacja, małe litery jednostek (m, k, p, t, h i cienki
ukośnik; jak „m” oryginału, „p” sięga dwa wiersze pod linię) i wersaliki Latin Extended
z ß. Litery ze znakami diakrytycznymi to litera bazowa ze znakiem w dwóch wierszach nad nią (ogonek, cedylla
i przecinek pod nią); kropki, kreska i kropka nad literą zajmują górny z tych wierszy, więc od litery dzieli je
wiersz cienia. Ł, Đ, Ø, Æ i ß mają własne kształty, małe litery rysuje się jak wersaliki, znaki łączące pomija się
(małe „i” z łączącą kropką to İ). O jest kanciaste, a 0 ma przekątną w środku, żeby „K120” i „SŁOWENIA” czytały się
przy 1x. Oryginał kładzie akcent o jeden wiersz wyżej, nachodząc na literę; port trzyma dla znaków dwa osobne
wiersze, na które pasek ma miejsce.

Ekrany menu piszą nagłówki, etykiety i wszystko, co się wybiera, tą samą czcionką: rodzina „Telemark Screen”
(`src/ui/fonts/telemark-screen.woff2`) to czcionka kolorowa COLRv0/CPAL wygenerowana z tych samych znaków.
`scripts/export-screen-glyphs.mjs` zapisuje piksele każdego znaku (`glyphPixels`, `fontCharacters` z `pixel-font.ts`)
jako JSON, a `tools/font/make_screen_font.py` buduje z niego czcionkę: każdy znak ma warstwę cienia (wpis 0 palety,
który arkusz stylów nadpisuje dla każdego odcienia przez `@font-palette-values`) i warstwę ciała w kolorze tekstu;
sam kontur znaku to ciało, dla przeglądarki bez czcionek kolorowych. Siatka: 8 pikseli na em od dwóch wierszy
znaków nad wersalikami do linii bazowej, na której stoi ostatni wiersz ciała; cień i znaki pod literą schodzą
pod nią. Każdy znak ma 6 pikseli szerokości, małe litery wskazują znaki wersalików. Obok czcionki leży skrót
SHA-256 eksportu (`telemark-screen.glyphs.sha256`); `scripts/lib/screen-font-glyphs.test.mjs` porównuje go
ze świeżym eksportem, więc zmiana znaków bez przebudowania czcionki zatrzymuje `pnpm test:scripts`. Polecenia
są w nagłówku `make_screen_font.py` (potrzebne pakiety: `tools/font/requirements.txt`). Rozmiary na ekranach są
wielokrotnościami 8 px, żeby piksele zostały ostre.

Dodatki portu: nazwa skoczni w lewym górnym rogu od (5, 5) (górna krawędź wielkich liter; znak nad wielką literą leży w wierszu 3, na wysokości górnej ramki okna wiatru), gdzie oryginał pisze nazwę pliku powtórki, w kolorze,
którym ją pisze (0xCB), i jak ona bez cienia (czytelna nad niebem i rozbiegiem); gdy w tym rogu leży przycisk pauzy
(sterowanie przechyłem w poziomie), nazwa stoi na prawo od niego, wyśrodkowana w pionie względem przycisku. Na
pasku etykieta fazy (rampa 0x58) i prędkość, biała z ciemniejszym cieniem: w szarej rampie 0x3C cień pięć stopni
niżej prawie nie odcinał się od liter. Wiersz o nowym rekordzie też jest bez cienia, jak w oryginale; miga co pół
sekundy, licząc od klatki lądowania, więc zawsze zaczyna od pełnego pół sekundy widoczności.

## Miejsca rzeczy świata na obrazie

Rzeczy świata stojące na czymś albo zawieszone w tle (rekwizyty, końce linii, drzewa, ptaki, księżyc, belka
startowa) port stawia na obrazie przez `src/render/scene-anchor.ts`, w jednym z czterech miejsc:

- na rysowanej powierzchni warstwy (płot, poręcz, krawędź zeskoku): kolumna najbliższa indeksowi tablicy, wiersz
  powierzchni pod tą kolumną (`onSurface`; koniec linii odległości z własną wysokością: `onSurfaceAtHeight`).
  Rekwizyt jest w kolumnie swojego indeksu albo, w kwadratowych pikselach, gdzie widok ten indeks pomija,
  w kolumnie sąsiedniej. Miejsca rekwizytów dają funkcje w `scene-extras.ts` (`sockPlaces`, `mastPlaces`,
  `inrunLampPlaces`), z których korzystają i rysowanie, i test ruchu;
- na warstwie tła, z jej przewijaniem (`layerPlacer` dla drzew, `layerScroll` dla ptaków);
- na niebie, tylko z dryfem gwiazd (`skyDrift`; księżyc wybiera miejsce raz na skok, `viewAtStart`);
- na samym ekranie (interfejs): bez świata pod spodem.

Belka startowa zostaje przy rachunku oryginału (`gatePlace`: zaokrąglona kolumna i dokładny wiersz), bo tak ją
rysuje oryginał; ta funkcja służy tylko belce. Poza modułem zostaje wszystko, co rysuje się kolumna po kolumnie:
powierzchnie z tablic warstw (`scene-layers.ts`, `hill-layer-tables.ts`, pliki zeskoku, rozbiegu, tła i gór)
i nocne prześwietlenie w `scene-floodlight.ts`, które wiersze kolumny bierze z przewijania warstw samo, a z modułu
tylko x świata pokazany w kolumnie (`worldXAtDepth`). Cień skoczka i figura mają własną, stałą kolumnę na obrazie.

Test `scene-anchor.guard.test.ts` pilnuje, że pliki spoza modułu i prymitywów nie wołają rzutu wprost, a plik
rekwizytów (`scene-extras.ts`) ani nie próbkuje kolumn obrazu, ani nie czyta wierszy powierzchni. W plikach, które
rysują powierzchnie, test nie odróżni wiersza powierzchni od miejsca liczonego ręcznie; tam rekwizyty i linie
pilnuje `scene-motion.test.ts` (opis w `testing.md`).

## Różnice portu (świadome)

- Widok ma kwadratowe piksele i szerokość od 256 do 480 kolumn: kolumna portu odpowiada 6/5 kolumny oryginału
  (`SQUARE_PIXEL_WIDTH`), środki ekranów się pokrywają; tablice liczone są także poza zakresem oryginału.
- Drzewo, którego tablica kluczowa w oryginale nie sięga (daleko za belką), dostaje u oryginału wysokość spoza
  tablicy; port stawia je na ziemi.
- Linia wychodząca poza ekran: oryginał przycina tylko jej wiersze (zmienia nachylenie), port rysuje ją całą
  i obcina piksele.
- Dodatki portu: pora dnia i pogoda, góry w tle (`scene-mountains.ts`: pasmo szczytów na najdalszej warstwie tła,
  przesuwane o połowę wolniej od niej, z mgiełką ku kolorowi nieba), rękawy wiatru i maszty z reflektorami na dalszym
  płocie, lampki na słupkach wzdłuż najazdu, gwiazdy i księżyc (rysowane po górach, tylko na niebie; miejsce
  księżyca wybierane raz na skok, dla kamery na starcie, tam, gdzie widać najwięcej nieba; dalej przesuwa się
  tylko z gwiazdami, a góry wchodzą przed niego; tarcza o promieniu 4 z dokładnością do pół piksela), ptaki (w żadnej fazie lotu nie są płaską kreską; latają
  w warstwie 7 tła nad szczytem najazdu i przesuwają się z nią w poziomie i w pionie, więc obraz zostawia je w górze,
  gdy kamera zjeżdża za skoczkiem; ich miejsca liczone od środka obrazu nie zależą od jego szerokości), duch rekordu
  (`scene-extras.ts`, `jump-view-ghost.ts`).
- Kolumny obrazu w kwadratowych pikselach pomijają co szósty indeks tablicy warstwy (6 kolumn
  oryginału na 5 obrazu), więc płot i krawędź pod danym miejscem biorą wysokość z indeksu, który kolumna akurat
  pokazuje. Rękaw, maszt i lampka najazdu stają w kolumnie, której indeks leży najbliżej ich własnego (przy remisie
  lewej), na wierszu tablicy dla tego indeksu, więc nie skaczą o wiersz względem płotu ani poręczy przy
  przewijaniu. Końce linii odległości zachowują wysokość oryginału, gdy ich kolumna jest pokazana, a w przeciwnym
  razie przechodzą do najbliższej pokazanej i zmieniają wiersz o tyle, o ile krawędź (`nearestViewColumn`). Śnieg oryginału (pojedyncze piksele na warstwach, natężenie losowane
  przy wejściu na skocznię i zapisywane w powtórce) port zastępuje własnym.
- Zmierzch i noc (dodatki portu, `palette.ts`): tło ma paletę „daleką” (o zmierzchu cieplejszą i ciemniejszą,
  nocą w świetle księżyca), skocznia „bliską”. O zmierzchu obie mają ten sam ciepły odcień, a tło jest tylko
  trochę ciemniejsze; słabszy odcień skoczni rysował ostrą granicę wzdłuż jej dalszej krawędzi. O zmierzchu
  światło reflektorów sięga 28 wierszy nad dalszą krawędź skoczni: piksele tła i drzew przechodzą ku kolorom
  palety bliskiej, przy krawędzi o 55%, wyżej coraz mniej (z kwadratem odległości), niebo zostaje bez zmian
  (`drawFloodlightSpill` w `scene-backdrop.ts`). Nocą tło zostaje w świetle księżyca, a światło reflektorów
  leży na skoczni (`scene-floodlight.ts`): skocznia jest w pełni oświetlona od 13 m przed pierwszym masztem
  (maszty co 30 m od 12 m za progiem, więc dalej zawsze w zasięgu któregoś) aż do końca wybiegu; wyżej, pod
  najazdem, słabnie co 1,5 m o stopień: siedem stopni przesuwa kolory od 9 do 60% ku palecie dalekiej, drobnymi
  schodkami jak pasma palety oryginału. Stopień piksela zależy od miejsca na świecie, które pokazuje (przesunięcie
  kamery liczone w całych kolumnach, jak przewijanie warstw): wiersze między dalszą a bliższą krawędzią
  przechodzą głębią od warstwy 17 do 23, więc granice stopni leżą na skoczni jak linie odległości i nie jadą
  z kamerą. Śnieg przed bliższą krawędzią nie ma własnego kształtu: jego głębia rośnie o stałą wartość na wiersz
  od bliższej krawędzi, więc przy ruchu kamery wzdłuż skoczni stopnie stoją w miejscu, a w pionie przesuwają się
  razem z bliższą krawędzią. Najazd i jego podpory zostają oświetlone (lampy najazdu).
- Podgląd stroju i ikona to ta sama scena bez interfejsu, wycięta wokół skoczka (`drawJumperPreview`).

## Weryfikacja

- **[pomiar]** Scena narysowana przez port w geometrii oryginału (320 kolumn, 14 px/m) zgadza się piksel w piksel
  ze zrzutami emulatora (`tools/re`) dla Karpacza, Anglii K50, Niemiec K120, Zakopanego 1 i Słowenii K250, poza
  drzewami, interfejsem i kolorami stroju (porównanie 2026-10-15).
- **[pomiar]** `src/render/hill-scene.golden.test.ts` porównuje z zapisanym stanem oryginału po ustawieniu każdej
  z 37 skoczni: paletę (768 bajtów), fale tła, wysokość bazową, linie, początki płotów, ściany i podpory najazdu,
  belkę i drzewa (miejsce, rozmiar, wysokość; bez drzew opisanych wyżej).
