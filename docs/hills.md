# Skocznie własne: format i reguły

## Czym jest skocznia

Skocznia własna gry to same dane: jeden obiekt zgodny z JSON, bez funkcji i bez kodu. Ten sam format obowiązuje
każdą skocznię, niezależnie od źródła (zrobioną ręcznie, wygenerowaną, a później zrobioną przez gracza). Dzięki
temu każda skocznia przechodzi te same kontrole, a plik skoczni nie może niczego wykonać. Kod: `src/hills/`.

Skocznie z plików oryginału mają własny opis w `hill-format.md`; ten dokument ich nie dotyczy.

## Format

Typ `HillSpec` (`src/hills/hill-spec.ts`), wersja formatu `schemaVersion: 1`. Przykład: skocznia „Ćwiczebna”
(`src/hills/own-hills.ts`).

```json
{
  "schemaVersion": 1,
  "id": "own-3",
  "name": "Ćwiczebna",
  "kPointM": 90,
  "profile": {
    "inrun": {
      "startXM": 10.6, "flatEndXM": 9.2, "lineEndXM": 25.3, "takeoffXM": 46,
      "lineSlope": -1, "lineInterceptM": 230, "curveA": 0.02
    },
    "landing": {
      "centerXM": 115, "centerYM": 150.9, "amplitudeM": 45, "widthM": 50,
      "outrunStartXM": 170, "outrunCurveA": 0.01, "knollBlend": 0.3
    }
  },
  "look": {
    "skyRgb6": [30, 50, 63],
    "terrain": { "seed": 4321, "amplitudeM": 50, "baseOverOutrunM": 3 },
    "trees": { "firstCount": 70, "secondCount": 30, "fromXM": 50, "toXM": 200, "seed": 5150, "hidden": [] },
    "supports": [
      { "fromXM": 7, "toXM": 9.5, "colour": 13, "frontColour": 25 },
      { "fromXM": 20, "toXM": 21, "colour": 13, "frontColour": 17 },
      { "fromXM": 33, "toXM": 40, "colour": 13, "frontColour": 25 }
    ],
    "inrun": { "platformStartXM": 6, "nearWallUpPx": 12, "nearWallDownPx": 11, "wallColour": 228, "gateColour": 163 },
    "marks": { "firstMarkM": 75, "markCount": 3, "fenceColour": 192, "fenceStartM": 0 }
  }
}
```

`profile` to parametry procedur budujących profil (`buildHillProfile` w `src/sim/hill-setup.ts`, znaczenie pól
w `physics-spec.md`), `look` to wygląd poza profilem (`HillLook` w `src/render/hill-look.ts`).

## Kontrola formatu

`parseHillSpec` (`src/hills/parse-hill-spec.ts`) czyta dane z niezaufanego źródła. Każdy obiekt jest sprawdzany
z listą znanych kluczy: klucz nieznany (także `__proto__`, `constructor`, `prototype`) i brakujący to błąd.
Dozwolone są tylko zwykłe obiekty, tablice i skończone liczby. Wynik jest budowany od nowa z dozwolonych pól.
Za długa lista i za długi tekst są zgłaszane bez czytania nadmiaru, więc rozmiar danych nie zwiększa kosztu kontroli.
Kontrola zbiera wszystkie problemy naraz; każdy ma stały identyfikator reguły (`format.…`), ścieżkę pola
i krótki opis po angielsku do logów. Teksty dla gracza dojdą w `src/text/ui-text.ts`.

Granice formatu (`src/hills/hill-spec-limits.ts`) mówią, co przyjmie silnik i rysowanie, a nie co jest dobrą
skocznią:

- wersja: wyższa od obsługiwanej daje jeden problem `format.newer-version` (dane z nowszej gry), inna `format.version`;
- `id`: małe litery i cyfry w grupach łączonych dywizem, 1..40 znaków, bo jest kluczem rekordów i powtórek;
- `name`: 1..24 znaki po normalizacji NFC, bez znaków sterujących, sterujących kierunkiem pisma i zerowej
  szerokości, tylko znaki, które czcionka obrazu skoku rysuje (`fontDraws` w `src/render/pixel-font.ts`), bo
  inaczej nazwa wyglądałaby inaczej, niż ją zapisano;
- szerokość tytułu: napis „nazwa K…” ma najwyżej 138 px, bo tyle miejsca zostaje w najwęższym obrazie (256 px) między
  przyciskiem pauzy w lewym górnym rogu (najdalej do kolumny 61) a oknem wiatru ze światłem startowym (57 px
  z odstępem) (`src/hills/hill-title.ts`);
- `kPointM`: liczba całkowita 20..300;
- rozbieg: zakresy pól oraz kolejność `startXM < takeoffXM` i `flatEndXM <= lineEndXM < takeoffXM`, bo funkcje
  profilu biorą część płaską do `flatEndXM`, prostą do `lineEndXM`, a łuk dalej; płaska część za końcem prostej
  zostałaby nadpisana łukiem; start może leżeć na części płaskiej;
- zeskok: zakresy pól, wybieg zaczyna się co najmniej 20 m za progiem i najdalej na 600 m;
- wygląd: kolory to indeksy palety 0..255 (bramka startowa najwyżej 254, bo jej druga połowa bierze następny
  indeks), niebo w 6-bitowym RGB, ziarna 0..65535, najwyżej 8 podpór i 8 ukrytych grup drzew, odcinki z początkiem
  przed końcem.

## Reguły geometrii

`geometryProblems` (`src/hills/hill-geometry.ts`) mierzy zbudowany profil (`hillGeometry`) i sprawdza progi
z `HILL_RULES` (identyfikatory `geometry.…`). Pomiary są skończone dla każdej skoczni, która przeszła kontrolę formatu.

- `join-height`: na złączach płaskie/prosta, prosta/łuk i zeskok/wybieg skok wysokości najwyżej 0,01 m, bo stopień
  w torze to uderzenie w nartę;
- `join-slope`: na złączach prosta/łuk i zeskok/wybieg różnica nachylenia najwyżej 0,5°; płaska część leży za
  belką startową i styka się z prostą pod jej pełnym kątem, więc tam sprawdzana jest tylko wysokość;
- `takeoff-angle`: kąt progu 6..12° w dół;
- `table-height`: próg 1..3 m nad zeskokiem;
- `landing-angle-at-k`: nachylenie zeskoku w punkcie K 34..48°, bo w okolicy K ląduje większość skoków i tam
  zeskok ma przejmować lądowanie;
- `k-near-steepest`: punkt K w poziomie najwyżej `max(15 m, 0,12 K)` od najbardziej stromego miejsca zeskoku
  (`kFromSteepestMaxM`): na dużej skoczni prawie najbardziej stromy odcinek zeskoku jest dłuższy, więc najbardziej
  strome miejsce może leżeć dalej od K. Udział 0,12 K wystarcza dużym skoczniom generatora z jego zapasem; duże
  skocznie oryginału leżą do około 0,18 K od K (zmierzone lokalnie na plikach gry), ale reguły stylu nie muszą
  ich przepuszczać.
  15 m trzyma małe skocznie przy kilku metrach, które skoczek rozróżnia;
- `landing-area-length`: koniec strefy lądowania (pierwsze miejsce za najbardziej stromym, gdzie zeskok jest
  łagodniejszy niż 32°, mierzony łukiem od progu) leży 0,1..0,4 K za punktem K, bo dalsze skoki potrzebują miejsca;
- `outrun-length`: od końca strefy lądowania do najniższego punktu wybiegu co najmniej 30 m w poziomie, na
  wyhamowanie;
- `outrun-within-scene`: najniższy punkt wybiegu najdalej 380 m, bo tyle obejmują tablice warstw sceny
  (`LAYER_TABLE_LENGTH_M` w `src/render/hill-layer-tables.ts`);
- `inrun-descends`, `landing-descends`: rozbieg opada od startu do progu, a zeskok od progu do najniższego punktu
  wybiegu (próbki co 0,1 m; próbka może leżeć najwyżej 1 mm wyżej od poprzedniej, bo przy dnie łagodnego wybiegu
  sąsiednie wysokości różnią się mniej, niż rozróżnia pojedyncza precyzja).

### Dwa poziomy reguł

Każda reguła geometrii ma poziom (`GEOMETRY_RULE_LEVELS`, pole `level` problemu; problemy formatu i symulacji
poziomu nie mają, bo z natury są dopuszczające):

- **dopuszczenie** (`admission`): reguły, których potrzebuje silnik albo scena, albo których nie łamie żadna
  skocznia tej gry; skocznia, która je łamie, jest odrzucana:
  - `join-height`, `join-slope`: stopień albo załamanie toru to uderzenie w narty;
  - `inrun-descends`: wznoszący się rozbieg może zatrzymać skoczka przed progiem;
  - `landing-descends`: wznoszący się zeskok to ściana, w którą skoczek wlatuje;
  - `table-height`: próg daleko nad zeskokiem albo pod nim odbiera wybiciu sens;
- **styl** (`style`): reguły nowoczesnej skoczni, których trzymają się skocznie własne gry; skocznia gracza, która
  je łamie, jest dopuszczana z uwagą, a nie odrzucana:
  - `takeoff-angle`: skocznie oryginału mają progi daleko poza tym zakresem i dobrze się na nich skacze;
  - `landing-area-length`: czy dobry gracz przeskoczy strefę lądowania, sprawdza symulacja;
  - `outrun-length`: czy skoczek zatrzyma się w scenie, sprawdza symulacja;
  - `outrun-within-scene`: scena jest rysowana do 380 m, ale liczy się to, że skoczek zatrzyma się przed jej
    końcem, co sprawdza symulacja; najniższy punkt wybiegu może leżeć dalej (tak jest na dwóch skoczniach
    oryginału);
  - `k-near-steepest`, `landing-angle-at-k`: czy dobry gracz ląduje blisko K, sprawdza symulacja.

`geometryProblems` zwraca problemy obu poziomów, `admissionProblems` tylko dopuszczające. Testy skoczni własnych
wymagają braku problemów obu poziomów. Test lokalny z plikami gry (`DSJ2_GAME_DIR`) sprawdza, że każda z 37 skoczni
oryginału przechodzi każdą regułę dopuszczenia (na każdej da się skakać);
liczbę skoczni oryginału spełniających każdą regułę pokazuje tylko wtedy, gdy któraś reguła dopuszczenia zawiedzie.

Zakresy reguł stylu to założenia projektu, a nie granice sprawdzone symulacją; to, co mają zapewniać, sprawdzają
kontrole oparte na symulacji skoków (następna sekcja).

## Kontrole symulacją

Geometria nie mówi, czy skocznia dobrze się skacze. Kontrole w `src/hills/hill-play.ts` puszczają prawdziwą
symulację (`startTrainingJump`, `stepTrainingJump`) z botami z `src/hills/hill-players.ts` i porównują wyniki
z progami `PLAY_RULES`. `playMeasures` zwraca same liczby, `playProblems` stosuje do nich progi (reguły `play.*`).
Każda kontrola obejmuje wszystkie skocznie własne, więc nowa skocznia wchodzi do nich przez same dane.

Dawne boty grały według skryptu: cel wybicia z próbowania celów w symulacji, w locie jeden kąt ciała (0,3 rad)
niezależnie od skoczni, wiatru i fazy lotu, lądowanie na stałej wysokości, bez czytania wiatru i bez wiedzy
o punktach. Były wiarygodne tylko do K120, a na 38 skoczniach z prostszym botem rozrzut odległości na dużych
skoczniach (40-60 m) pochodził od bota, a nie od skoczni. Teraz grają polityką gracza, którą wytrenowano,
a wyrocznia mówi, ile da się ze skoczni wyciągnąć najwyżej.

### Co widzi gracz

`playerView` (`src/hills/player-view.ts`) zwraca z bieżącego stanu skoku tylko to, co widzi gracz: klatkę, fazę,
prędkość, czas do krawędzi progu przy obecnej prędkości, wysokość nad terenem pod skoczkiem i tempo, w jakim maleje,
kąt ciała, liczbę klatek od oderwania oraz wiatr wzdłuż skoczni tak, jak pokazuje go wskaźnik (składowa x
z `displayedWindMPerS`, liczona deterministycznym cosinusem, żeby bot decydował tak samo w każdym silniku). Nie widzi
wiatru z przyszłości ani danych skoczni poza terenem pod sobą i krawędzią przed sobą.

### Polityka gracza

`PlayerPolicy` (`src/hills/player-policy.ts`) to 10 liczb z jednostką w nazwie:

- `takeoffAimS`: oba przyciski w przysiadzie, gdy czas do krawędzi spadnie do tej wartości; trzymane do oderwania;
- `earlyFlightFrames`, `earlyLeanRad`: pochylenie (minus kąt ciała, do którego prowadzi sterowanie) w pierwszych
  klatkach lotu;
- `leanRad`, `leanPerSpeedRadPerMPerS`, `leanPerHeightRadPerM`, `leanPerTailWindRadPerMPerS`: pochylenie w reszcie
  lotu, liniowe względem prędkości (od 25 m/s), wysokości nad terenem (od 3 m) i pokazanego wiatru w plecy;
  ograniczone do -0,2..0,9 rad;
- `landingHeightM`, `landingPerClosingS`: przy opadaniu prawy przycisk przez 4 klatki, gdy wysokość spadnie poniżej
  `landingHeightM` plus tempo opadania razy `landingPerClosingS`;
- `telemark`: lewy od 8. do 12. klatki po prawym (telemark) albo bez niego (na dwie nogi).

Sterowanie w locie to poprawka 60 mikrokroków myszy na radian błędu kąta, obcięta do 40 na klatkę. Szum bota
pochodzi z własnego, zasianego `BorlandRandom` (rozkład zbliżony do normalnego z sumy 12 liczb jednostajnych, bez
funkcji przestępnych, więc wynik jest ten sam w każdym silniku).

Trzy poziomy graczy (`PLAYER_LEVELS`) to wytrenowana polityka z ludzkim szumem:

- słaby: rozrzut wybicia 0,08 s, sterowanie 0,6 poprawki z szumem 8, lądowanie 0,7 m niżej niż polityka, +- 1 m;
- średni: rozrzut 0,04 s, pełne sterowanie z szumem 4, lądowanie 0,2 m niżej, +- 0,5 m;
- dobry: rozrzut 0,015 s, pełne sterowanie z szumem 2, lądowanie jak polityka, +- 0,2 m.

`EXACT_PLAYER_LEVEL` to dobry gracz bez szumu, czyli sama polityka.

### Trening

`node scripts/train-player.mjs [liczba ocen]` (domyślnie 400) trenuje politykę i wypisuje liczby oraz wyniki do
przepisania do `TRAINED_PLAYER_POLICY` i `TRAINED_POLICY_SCORES`; niczego nie zapisuje. Skrypt, a nie plik testów:
trening trwa minuty, a wynikiem są liczby do przejrzenia i przepisania, nie werdykt. Trening jest deterministyczny:
ten sam kod daje te same liczby.

Zbiór treningowy to zbiór wygenerowany (sekcja „Generator skoczni”): 27 skoczni od K45 do K260 o różnych
zeskokach, garbach i rozbiegach. Generuje go skrypt bez reguł symulacji, bo te oceniają skocznię wytrenowanym
graczem, którego trening zastępuje; reguły na zbiorze sprawdza test stabilności. Wcześniej zbiorem były warianty
jedynej skoczni własnej, a warianty o innym kształcie zeskoku nie przechodziły reguł dopuszczenia, więc gracz nie
widział innego kształtu i na skoczniach oryginału powyżej K120 zostawał daleko od wyroczni.

Na każdej skoczni, na dwóch najsilniejszych ziarnach każdej klasy wiatru, skaczą trzej gracze: bez szumu oraz
średni i dobry z tym samym szumem własnych błędów, co w kontrolach (`PLAYER_LEVELS`). Wynik to średnia punktów gry,
a upadek lub dyskwalifikacja liczy się jako -100 punktów. Rozsądny gracz chce punktów mimo własnych błędów: trening
samego gracza bez szumu wybrał nacisk lądowania na 1,4 m, a średni gracz z tym szumem przewracał się wtedy na
jednej trzeciej skoków skoczni K50.

Przeszukiwanie startuje od gracza odniesienia: najpierw strategia ewolucyjna (1+6) z zasianym generatorem (70%
ocen; wszystkie liczby naraz, rozrzut w krokach zgrubnych, szerszy po zysku, węższy bez niego), potem przeszukiwanie
po współrzędnych z krokami dokładnymi. Styl lądowania nie jest trenowany: gracz odniesienia lądujący na dwie nogi
upadał tak często, że jego średnia spadała z 128 do 82 punktów.

Wynik: 137,35 punktu na zbiorze treningowym (gracz odniesienia 131,36), 118,06 na skoczniach własnych spoza zbioru
(dziś sama Ćwiczebna), po 293
ocenach, około 35 minut na tej maszynie. Część wczesna lotu wypadła (0 klatek), wiatr i prędkość nie weszły do
pochylenia; zostały pochylenie 0,24 rad rosnące o 0,016 rad na metr wysokości, wybicie 0,2 s przed krawędzią
i lądowanie na 2,2 m. Test jednostkowy sprawdza tylko, że liczby dają zapisany wynik na skoczniach własnych spoza zbioru: tani
dowód, że ani polityka, ani symulacja się nie zmieniły.

Pokazany wiatr dobrze przewiduje odległość (gracz bez szumu, ziarna 1-64, składowa wiatru startowego wzdłuż
skoczni: współczynnik korelacji od -0,88 przy K50 do -0,96 przy K150; od 0,75 m przy K50 do 2,9 m przy K185 mniej na
każdy 1 m/s wiatru w plecy), ale pochylenie nie ma dźwigni, która by to odrobiła, więc czytanie wiatru w locie nic
graczowi nie daje. Wiatr ma znaczenie dla oczekiwań co do odległości, nie dla sterowania.

### Wyrocznia

`oracleJump` (`src/hills/hill-oracle.ts`) zna skocznię i ziarno, więc i przyszły wiatr. Szuka zmian skoku
wytrenowanego gracza, które dają najwięcej punktów: przesunięcia celu wybicia o całe klatki, pochylenia dodanego
w czterech częściach lotu (do 35, 105 i 210 klatek od oderwania i dalej) i przesunięcia wysokości lądowania. To
przeszukiwanie po współrzędnych z krokami 0,1 rad i 1 m, potem 0,04 rad i 0,4 m, najwyżej 60 skoków na ziarno;
upadek i dyskwalifikacja to najgorszy wynik (-100 punktów). Startuje od skoku gracza, więc nigdy nie wypada
gorzej od niego. Na skoczni Ćwiczebna cztery wyszukiwania (po jednym na klasę wiatru) to 141 skoków i około 1,3 s.

### Porównanie z wyrocznią na skoczniach oryginału

Test lokalny (z `DSJ2_GAME_DIR`, patrz niżej) gra każdą z 37 skoczni oryginału wytrenowanym graczem i wyrocznią na
najsilniejszym ziarnie każdej klasy wiatru. Odległość, którą dokłada wyrocznia, jako część K (średnia i 90. centyl
w przedziale wielkości), pomiar z 2026-10-17 dla obecnej polityki:

| K | skoczni | średnio | 90. centyl | punkty średnio | upadki gracza |
|---|---|---|---|---|---|
| do 90 | 10 | 0,061 | 0,097 | 11,3 | 0 |
| 90-120 | 7 | 0,073 | 0,102 | 15,7 | 0 |
| 120-160 | 8 | 0,091 | 0,163 | 20,3 | 0 |
| powyżej 160 | 12 | 0,071 | 0,162 | 17,2 | 0 |

Margines jest względny, w tym samym pomiarze tej samej polityki: przedział jest wiarygodny, gdy średnia i 90. centyl
wynoszą najwyżej 1,25 raza tyle co w najmniejszym przedziale (do K90) i gracz nie upada. Polityka odporna na własne
błędy celowo zostawia wyroczni odległość przy każdej wielkości, więc liczy się, czy bot jest na danej wielkości tak
wiarygodny jak na wielkościach już uznanych. Liczba 1,25 daje dla wcześniejszej polityki ten sam werdykt co dawny
margines bezwzględny (średnio 0,06 K, 90. centyl 0,12 K): 90-120 miało 1,12 i 0,97 raza (przechodzi), 120-160 1,47
i 1,41 (nie przechodzi). Dla obecnej polityki 90-120 ma 1,20 i 1,05 raza, 120-160 1,49 i 1,68, powyżej 160 1,16
i 1,67. Granica K120 (`botReliableMaxKPointM`) zostaje; test lokalny pilnuje marginesu do niej.

Okno wybicia to liczba klatek celu (co 1/70 s), przy których skoczek bez błędów ląduje najwyżej 3 m przed
najlepszym skokiem, bez upadku i dyskwalifikacji. Jedna klatka wybicia jest warta kilka metrów: to cecha fizyki
gry, a nie skoczni, więc okno liczy się w klatkach.

Najlepszy cel wybicia znajduje `takeoffAimSearch`, z lotem i lądowaniem wytrenowanego gracza bez szumu. Odległość w funkcji celu rośnie o 5-7 m na klatkę do jednego
szczytu i za nim spada (z urwiskiem około 6 klatek za wcześnie), więc wyszukiwanie zaczyna od najlepszego celu
poprzedniego ziarna (dla pierwszego od 14 klatek) i idzie w obie strony, aż na danej stronie dwa cele z rzędu
wypadną ponad 3 m poniżej najlepszego albo skończą się upadkiem; strona, na której pojawia się nowy najlepszy,
idzie dalej, więc najlepszy na brzegu poszerza wyszukiwanie. Zakres celów to od -10 do 30 klatek. Na skoczni
Ćwiczebna wyszukiwanie zajmuje 7-9 skoków na ziarno zamiast 41. Test porównuje je z przeglądem wszystkich 41 celów
(`src/hills/test-support/full-aim-sweep.ts`) na 8 ziarnach: najlepsza odległość, najlepszy cel i okno są równe.

### Klasy wiatru

Wiatr startowy skoku zależy tylko od ziarna (`createStartWind`, wołane przez `startTrainingJump`), więc próba
wybiera ziarna według wiatru, zanim skok się zacznie. `windClassSeeds` czyta wiatr startowy 256 kolejnych ziaren
i dla każdej klasy (`WIND_CLASSES`) bierze ziarna o najwyższej ocenie, od najsilniejszego, bez powtórzeń między
klasami (klasy wybierane w tej kolejności):

- `head`: najsilniejszy wiatr czołowy, najbardziej ujemna składowa wzdłuż skoczni (`xMPerS`);
- `calm`: cisza, najmniejsza prędkość (`speedMPerS`);
- `tail`: najsilniejszy wiatr w plecy, najbardziej dodatnia składowa wzdłuż skoczni;
- `variable`: wiatr najbardziej zmienny, największa skala błądzenia losowego w czasie skoku (`variabilityMPerS`).

Na ziarnach 1-256 są to na przykład `head` 122, 253, 23, 125 (składowa -4,5 m/s), `calm` 182, 185, 27, 226
(0,04-0,53 m/s), `tail` 138, 202, 234, 10 (+4,5 m/s), `variable` 14, 33, 235, 102 (zmienność 0,44-0,47). Wiatr
czołowy niesie dalej: najlepszy skok przy nim to około 100 m, przy wietrze w plecy około 86 m.

### Próba

Reguły są mierzone na zasianych skokach. Próba (`PLAY_SAMPLE`):

- 16 ziaren na klasę wiatru (razem 64), na których skacze każdy poziom gracza i bot bez błędów (sam wiatr);
- 4 najsilniejsze ziarna na klasę (razem 16) w wyszukiwaniu celu wybicia;
- najsilniejsze ziarno każdej klasy (razem 4) dla wyroczni, do 60 skoków każde;
- 12 skoków zaprojektowanych na najsilniejszym ziarnie każdej klasy (razem 48);
- 16 skoków z losowym sterowaniem (ziarna od 1) jako dodatkowe sprawdzenie na ślepo.

Każda klasa jest więc w każdej części próby w równej części. `PlaySample` przyjmuje pierwsze ziarno przeglądu
wiatru i skoków losowych, więc tę samą ocenę można powtórzyć na rozłącznej próbie. Jedna ocena to około 580
skoków i około 5,3 s na tej maszynie, z czego wyrocznia 141 skoków i około 1,3 s (bez wyroczni około 440 skoków
i 4 s, a jeszcze wcześniej 976 skoków i 7,8 s).

### Skoki zaprojektowane

`DESIGNED_SCENARIOS`: skok dobrego gracza bez błędów przy celu z wyszukiwania (mediana najlepszych celów), w każdym
jedna rzecz zmieniona: wybicie dużo za wcześnie (20 klatek), wcześnie (4), późno (-4 klatki), bez wybicia; poza
w locie pochylona (kąt ciała 0,6 rad), wyprostowana (0 rad), zmieniana co 35 klatek (w pozostałych skokach lot
prowadzi wytrenowana polityka, a lądowanie przychodzi na 1,8 m); lądowanie wcześnie (8 m nad
zeskokiem), na dwie nogi (tylko prawy przycisk), bez lądowania; do tego jeden skok późny, ze zmienną pozą i bez
lądowania. Każdy skok ma nazwę `<klasa>/<scenariusz>` (skoki losowe `random/<ziarno>`), a komunikat reguły podaje
nazwę skoku, który ją złamał. Na skoczni Ćwiczebna upadają skoki bez wybicia (`fallType` 5) i bez lądowania
(`fallType` 4); skoki losowe kończą się dyskwalifikacją z upadkiem typu 2, 3 albo 4.

Reguły:

- `bot-unreliable`: skocznia powyżej K120 nie przechodzi kontroli, bo wytrenowany gracz trzyma się blisko wyroczni
  tylko do tej wielkości (porównanie wyżej), a wyżej wynik zależy od bota, nie od skoczni;
- `takeoff-window`: mediana okna wybicia po ziarnach przeglądu co najmniej 2 klatki, żeby nie trzeba było trafić
  jednej klatki;
- `takeoff-window-share`: okno co najmniej 2 klatki na co najmniej 75% ziaren przeglądu. Okno 1 klatki zdarza się
  od czasu do czasu na każdej skoczni (krawędź progu wypada przy danym wietrze między dwiema klatkami), więc
  minimum z kilku ziaren przechodziło albo oblewało przypadkiem: na skoczni Ćwiczebna minimum z 4 ziaren wynosiło
  3 klatki na pięciu rozłącznych zbiorach i 1 klatkę na szóstym;
- `takeoff-clean`: każde ziarno przeglądu ma co najmniej jedno czyste wybicie (okno co najmniej 1 klatka), bo
  wiatr, przy którym nie da się czysto wybić, byłby nieuczciwy;
- `good-median`: mediana dobrego gracza od K-20 do K+10 m, żeby skocznia skakała się na swój rozmiar;
- `levels-ordered`: mediany rosną od słabego przez średniego do dobrego, bo umiejętność ma się opłacać;
- `skill-wins`: dobry skacze dalej od średniego w co najmniej 70% par skoków przy tym samym wietrze;
- `good-falls-in-class`: dobry gracz nie upada w żadnej klasie wiatru;
- `fall-rate`: średni gracz przewraca się (lub jest dyskwalifikowany) najwyżej w 10% skoków, dobry najwyżej w 3%.
  Próg średniego jest luźniejszy niż wcześniejsze 5% (przy 32 skokach): bot średni ląduje z rozrzutem wysokości
  lądowania 0,5 m, więc pojedynczy upadek to błąd bota, a nie skoczni, a przy 5% jeden upadek więcej odwracał
  werdykt (na skoczni Ćwiczebna 0, 1 i 1 upadek na 32 w trzech rozłącznych zbiorach). Dobry gracz prawie nigdy
  nie powinien upaść. Skocznia Ćwiczebna spełnia także dawne 5%;
- `best-short`: mediana najlepszych skoków (po ziarnach wiatru) co najmniej K-10 m, inaczej skoczni nie da się
  doskoczyć do K; mediana, a nie najgorsze ziarno, żeby jeden silny wiatr czołowy nie oblał uczciwej skoczni;
- `best-past-landing-area`: najdłuższy z najlepszych skoków wyroczni (po jednym na najsilniejszym ziarnie każdej
  klasy wiatru), czyli skok w najkorzystniejszej klasie (komunikat ją podaje; na skoczni Ćwiczebna to wiatr czołowy,
  102,5 m przy końcu strefy na 120,8 m), najwyżej 5 m za końcem strefy lądowania, żeby nikt jej nie przeskoczył.
  Wcześniej mierzyło to wyszukiwanie celu wybicia, które zmieniało tylko cel, a wyrocznia szuka też lotu
  i lądowania;
- `flight-time`: mediana lotu dobrego gracza co najmniej 2,5 s, żeby był to prawdziwy lot;
- `flight-height`: 90. centyl największej wysokości nad zeskokiem najwyżej 8 m, bo skoczek leci blisko stoku;
- `takeoff-speed`: prędkość na progu od 50 do 120 km/h, w zakresie skoczni narciarskich;
- `wind-spread`: odchylenie standardowe odległości bota bez błędów przy stałym celu (sam wiatr) najwyżej 8% K,
  bo ten sam wiatr niesie dalej w dłuższym locie (na skoczni Ćwiczebna zmierzono 5,5% K);
- `stress-ends`, `stress-finite`: skoki zaprojektowane i losowe kończą się przed limitem klatek i dają skończone
  liczby;
- `stress-within-scene`: każdy z nich zatrzymuje się przed 380 m, gdzie kończy się scena;
- `stress-below-terrain`: punkt skoczka schodzi najwyżej 0,5 m pod teren (na skoczni Ćwiczebna zmierzono 0 m).

### Stabilność werdyktu

Reguła liczona z próby musi dać ten sam werdykt na innej próbie, inaczej mierzy próbę, a nie skocznię. Test
w `src/hills/hill-play.stability.test.ts` ocenia każdą skocznię własną na trzech rozłącznych zbiorach ziaren
(przegląd wiatru 1-256, 257-512, 513-768; skoki losowe 1-16, 17-32, 33-48) i wymaga tej samej listy reguł
niespełnionych na każdym z nich.

Kontrole mają dwa poziomy. Zwykłe uruchomienie testów (i bramka przed PR) ocenia szczegółowo skocznię
treningową (pierwszą skocznię własną), na próbie opisanej wyżej; `corepack pnpm test src/hills` trwa kilkanaście
sekund. Test stabilności ocenia każdą skocznię własną (do granicy wiarygodności botów musi przejść wszystkie
reguły) i cały zbiór wygenerowany, łącznie około 5 minut na tej maszynie, więc ma osobne polecenie,
`corepack pnpm test:hills-stability` (zmienna `HILL_STABILITY=1` dołącza plik, który `vite.config.ts` poza nią
pomija). Bramka przed PR zmiany w tych ścieżkach uruchamia je także lokalnie. CI uruchamia je w zadaniu `checks`, gdy zmiana dotyka
`src/hills/`, `src/sim/`, `src/game/`, workflow, `package.json` albo `vite.config.ts`, a także gdy nie da się
ustalić, co się zmieniło (ręczne uruchomienie, brak poprzedniego commita).

### Równe szanse

- Te same wejścia dają ten sam wynik na każdym urządzeniu: test sprawdza, że skok z tym samym ziarnem, graczem
  i szumem daje ten sam skrót stanu końcowego, a z innym ziarnem inny.
- Umiejętność ma ważyć więcej niż wiatr: dobry gracz wygrywa ze średnim w większości par, a sam wiatr przesuwa
  skok o ograniczoną liczbę metrów.
- Żadna skocznia nie może wymagać trafienia jednej klatki: okno wybicia ma zwykle co najmniej 2 klatki, a przy
  każdym wietrze da się wybić czysto.
- Żadna skocznia nie może pozwolić dobremu skoczkowi wylądować za strefą lądowania.

Jedna klatka wybicia (1/70 s) jest warta kilka metrów odległości. To cecha fizyki gry, wspólna dla wszystkich
skoczni, a nie wada konkretnej skoczni.

## Kontrole obrazu

Testy obrazu (`src/render`), które mówią coś o rysowaniu skoczni, przechodzą przez wszystkie skocznie własne
(`OWN_HILLS`). Liczby biorą z danych skoczni: punkt K z `kPointM`, chwile wybicia jako udział klatek od startu
rozbiegu do progu, miejsca z profilu. Nowa skocznia dostaje je bez zmian w testach.

- ruch obrazu (`scene-motion.test.ts`): rekwizyty, końce linii odległości, ptaki i księżyc trzymają się swoich
  miejsc przez cały skok bota, bo każda skocznia ma inne miejsca tych rzeczy;
- rekwizyty i linie (`scene-props.test.ts`, `scene-layers.test.ts`): rękawy, maszty, lampy rozbiegu i linia K
  stoją na swoich powierzchniach i w swojej odległości, liczone z profilu tej skoczni;
- sceneria (`scene-scenery.test.ts`): drzewa, ptaki, księżyc i światło reflektorów na danych tej skoczni, bo ziarno
  drzew i profil zmieniają ich miejsca;
- sceneria z dala od toru: żadne drzewo nie stoi na płaszczyźnie skoczka ani przed nią (drzewa są tylko na
  warstwach za dalszą krawędzią zeskoku, z samej konstrukcji), a podpory rozbiegu kończą się najdalej na progu,
  bo za nim stałyby w zeskoku;
- figura skoczka (`jump-view.test.ts`): każda faza skoku rysowana bez pustych pikseli, figura na śniegu i w korycie
  rozbiegu przy wybiciu za wcześnie, wcześnie, tuż przed progiem i bez wybicia, bo te przypadki zależą od długości
  rozbiegu;
- tytuł (`jump-view.test.ts`): w najwęższym obrazie (256 px) i przy przycisku pauzy przesuwającym tytuł najdalej
  w prawo cały napis jest w obrazie i żaden jego piksel nie leży w kolumnach okna wiatru i światła startu;
  sprawdza to rysunek, a nie tylko szerokość liczoną przy kontroli formatu;
- budżet czasu klatki (`frame-time.budget.test.ts`): rysowanie najszerszego obrazu tej skoczni mieści się
  w budżecie, bo sceneria każdej skoczni rysuje się inaczej;
- migawka pikseli (`jump-view.pixels.test.ts`): pierwsza skocznia ma pełny zestaw, każda następna własne klucze
  (momenty skoku z telemarkiem, 356 px, dzień, zmierzch i noc, bez śniegu i mgły); test na kopii skoczni z innym
  niebem i drzewami sprawdza, że inny wygląd daje inne klatki.

Testy, którym wystarcza dowolna skocznia (pasek, podpowiedzi, teksty, menu, dźwięk, powtórki, zapis), zostają na
pierwszej skoczni własnej, żeby nie mnożyć czasu testów.

## Podobieństwo skoczni

`src/hills/hill-likeness.ts` mierzy, jak bardzo dwie skocznie są do siebie podobne, wyłącznie z ich danych.
`hillShape` opisuje skocznię kilkoma liczbami: punkt K, spadek zeskoku poniżej progu w 12 równych odstępach
poziomych od progu do końca obszaru lądowania (jako część K, więc skocznie różnej wielkości dają się porównać),
długość poziomą tego odcinka jako część K, spadek rozbiegu, kąt progu i wysokość progu nad zeskokiem. Wygląd
(niebo, teren, drzewa, podpory, ogrodzenia) się nie liczy: skocznia przemalowana to ta sama skocznia.

`hillDistance` to średnia kwadratowa różnic tych składników, każdej podzielonej przez skalę z `LIKENESS_SCALES`
(10 m punktu K, 0,02 K spadku zeskoku, 0,05 K długości zeskoku, 5 m spadku rozbiegu, 1° kąta progu, 0,5 m wysokości
progu). Skala to różnica, którą skoczek odczuwa na skoczni, więc żaden składnik nie przeważa samą jednostką;
punkty zeskoku tworzą jeden składnik, żeby profil nie przeważał liczbą punktów. Odległość wynosi 0 dla tej samej
skoczni i jest symetryczna.

Skocznie bliższe niż `LIKENESS.tooAlike` (0,4) uznaje się za tę samą skocznię: kopia skoczni oryginału zostaje
odrzucona, podobnie jak skocznia zbyt bliska już opublikowanej. Ponieważ każda skala to w przybliżeniu najmniejsza
różnica, którą skoczek odczuwa, odległość poniżej 1 to różnica ledwie odczuwalna, a poniżej progu praktycznie żadna.
Próg leży z zapasem poniżej odległości dwóch najbliższych różnych skoczni oryginału, więc te liczą się jako różne.
Przesuwanie liczb profilu o procent ich wartości nie sprawdza kopii: 1% bezwzględnej wysokości przesuwa próg
skoczni o metry, co daje już inną skocznię do skakania, ocenianą przez pozostałe reguły jak każda nowa.

### Porównanie ze skoczniami oryginału

`src/hills/original-hills.local.test.ts` porównuje skocznie własne ze skoczniami oryginału odczytanymi z plików
gracza. Działa tylko z ustawionym `DSJ2_GAME_DIR` (jak testy porównawcze), nigdy w CI; z ustawioną zmienną i bez
plików kończy się błędem, a nie pominięciem. Nic odczytanego z plików gry nie trafia do repozytorium ani na dysk.
Sprawdza, że żadna skocznia własna nie jest za bardzo podobna do skoczni oryginału, że każda gra w zakresie
skoczni oryginału o punkcie K w granicach 15 m od swojego (najlepsza odległość i mediana dobrego gracza względem K,
prędkość na progu, czas lotu, okno wybicia, rozrzut od wiatru jako część K; zakres poszerzony o margines
rozrzutu pomiaru), że skocznie oryginału przechodzą kontrolę formatu oraz że wytrenowany gracz trzyma się marginesu
wyroczni na skoczniach do granicy `botReliableMaxKPointM` (porównanie z wyrocznią wyżej; tabelę przedziałów podaje
komunikat, gdy test nie przechodzi). Całość trwa około 2,5 minuty.

```sh
DSJ2_GAME_DIR=<katalog gry> corepack pnpm test src/hills/original-hills.local.test.ts
```

## Odcisk geometrii i identyfikator

`hillFingerprint` (`src/hills/hill-fingerprint.ts`) to skrót FNV-1a (32 bity, 8 cyfr szesnastkowych) z punktu K
i 20 liczb zbudowanego profilu, każdej jako 4 bajtów wartości pojedynczej precyzji (little-endian). Wygląd do
niego nie wchodzi. Test przypina odcisk każdej skoczni własnej. Zmiana geometrii oznacza nowy identyfikator,
a stary trafia do `RETIRED_OWN_HILL_IDS` (`src/game/hill-choice.ts`): rekordy i powtórki zostają przy starym
kształcie i nigdy nie spotykają nowego.

Skocznia „Ćwiczebna” ma obecnie identyfikator `own-3`; `own-1` i `own-2` to jej wcześniejsze kształty. Na `own-2`
rozbieg był krótszy (`startXM` 11,4 i `flatEndXM` 10 zamiast 10,6 i 9,2) i najlepszy skok lądował w okolicy punktu
K; na `own-3` ląduje kilka metrów za nim, jak na skoczniach podobnej wielkości.

## Generator skoczni

`generateHill(character, seed)` (`src/hills/hill-generator.ts`) robi skocznię z kilku wartości zrozumiałych dla
człowieka zamiast czternastu liczb profilu. Służy do treningu gracza i do testów; jest też podstawą przyszłego
edytora skoczni dla graczy. Dziesięć skoczni zbioru do K120 jest w grze (`own-14` do `own-23`, każda o innym
położeniu belki, płaskiej części, wysokości progu, stromości rozbiegu i celu najlepszego skoku; wcześniejsze
`own-4` do `own-13` miały jedno ustawienie belki, jeden wygląd rozbiegu i jeden cel dla wszystkich, więc zastąpiły
je nowe pod nowymi identyfikatorami, a stare są wycofane): ich dane są skopiowane do `own-hills.ts` z własnym
ziarnem scenerii, a `SET_HILLS_IN_GAME`
(`src/hills/test-support/generated-hills.ts`) wiąże charaktery zbioru z tymi skoczniami. Zbiór bierze je takie,
jakie są w grze (`keptHill`: pomiar najlepszego skoku i te same kontrole co przy generowaniu, bez wyszukiwania),
zamiast generować je na nowo, bo późniejsza zmiana konstrukcji nie może zmienić skoczni, którą gra już ma
(rekordy i powtórki należą do odcisku; odciski przypina `hill-fingerprint.test.ts`). W kontroli podobieństwa
liczą się jak pozostałe skocznie zbioru. Większe skocznie zbioru czekają na bota, który gra na nich wiarygodnie. Droga do gry jest ta sama co
dla każdej skoczni własnej (sekcja „Dodanie skoczni”: dane do `own-hills.ts`, nowy `id`, kontrole, migawka, odbiór
na urządzeniu).

### Charakter skoczni

`HillCharacter`:

- `kPointM`: wielkość skoczni, punkt K;
- `landingSteepnessDeg`: największe nachylenie zeskoku;
- `landingAreaPastKShare`: jak daleko za K sięga strefa lądowania, jako część K (szerszy zeskok przy większej);
- `knoll`: `short`, `medium` albo `long`: jak długo zeskok za progiem się zaokrągla, zanim stanie się stromy;
- `inrunSteepnessDeg`: nachylenie prostej części rozbiegu;
- `takeoffAngleDeg`: kąt progu;
- `look`: motyw nieba (`day`, `dusk`, `winter`); wygląd nie zmienia skakania, a położenia podpór, drzew
  i znaczników odległości wynikają z profilu;
- opcjonalnie (`CHARACTER_LIMITS`): `gateXM`, gdzie stoi belka startowa (początek rozbiegu, 6..34 m, domyślnie 10);
  `flatBehindGateM`, długość płaskiej części za belką (0,5..7 m, domyślnie 1,4); `bestPastKM`, cel najlepszego
  skoku wyroczni w ciszy (od K+3 do najwyżej K+18, szerokość co najmniej 3 m, koniec co najmniej 2 m przed końcem
  strefy lądowania z charakteru, żeby reguła „najlepszy skok za strefą lądowania” nie zawiodła; domyślnie K+3..K+8); `tableHeightM`, wysokość progu nad zeskokiem (1,2..2,6 m w granicach reguły 1..3 m, domyślnie 2).
  Charakter poza tymi zakresami to błąd (`characterProblems`, reguła `generator.character`). Charakter z którąś
  z tych wartości ma identyfikator ze skrótem FNV-1a wszystkich liczb charakteru (`gen-k<K>-<skrót>-<motyw><ziarno>`),
  bo pełny zapis przekroczyłby 40 znaków formatu; charaktery bez nich zachowują dotychczasowy zapis.

`seed` ustala kolory (ściany najazdu z 7 ramp palety sceny, belka startowa z 6, bandy z 8; `LOOK_COLOURS`, listy
różnej długości dają sąsiednim ziarnom różne zestawienia), losuje z `LOOK_RANGES` podpory (jedna pod pomostem,
szeroka pod końcem rozbiegu, kończąca się 0,1 do 0,8 m przed progiem, jak na każdej skoczni oryginału, i do trzech
cienkich albo szerokich między nimi), wysokości ścian nad torem i pod nim, długość pomostu (pomost z płaską częścią
zajmuje 3,5 do 9% K; dłuższy na małej skoczni wygląda jak molo), wysokość terenu, liczbę drzew i początek band, a także końcówkę identyfikatora; profil zależy tylko od charakteru. Identyfikator
(`generatedHillId`) jest zapisem charakteru, więc ten sam charakter daje ten sam identyfikator.

### Konstrukcja

Wszystkie stałe są w jednym obiekcie `GENERATOR` (z jednostką w nazwie). Dobrano je z fizyki i celów gry, a nie
z liczb skoczni oryginału.

- Rozbieg zaczyna się na belce (`gateXM`, domyślnie 10 m), z płaską częścią za nią (domyślnie 1,4 m), biegnie prosto pod kątem z charakteru
  i przechodzi parabolą w kąt progu. Promień łuku rośnie z wielkością skoczni (0,25 K), bo szybszy skoczek
  potrzebuje łagodniejszego łuku przy tym samym nacisku na narty, najwyżej do 40 m (od K160): na dużej skoczni
  łuk 0,25 K zajmuje tyle sceny, że prostej nie zostaje miejsca na prędkość, której skocznia potrzebuje; i najmniej
  19 m: 0,25 K dawał małej skoczni łuk tak ciasny, że przy niższej prędkości dociskał skoczka mocniej niż na
  większych skoczniach. Rozbieg zaczyna się na belce z charakteru (domyślnie 10 m) z płaską częścią za nią. Złącza są gładkie z samej budowy profilu
  (`buildHillProfile` wylicza współczynniki łuku i wybiegu).
- Próg leży na wysokości 200 m, zeskok zaczyna się pod nim o wysokość progu z charakteru (domyślnie 2 m, w środku zakresu reguły wysokości progu).
- Zeskok to krzywa tanh formatu, `y = cY - A tanh((x - cX) / w)`. Największe nachylenie to `A / w`, więc
  `A = w tan(nachylenia)`. Próg leży o liczbę szerokości zależną od garbu (1,2, 1,35 albo 1,5) przed środkiem.
- Wybieg dołącza do krzywej 0,3 szerokości za jej środkiem, gdy zeskok jest jeszcze stromy, i wypłaszcza się
  parabolą o krzywiźnie `tan 32° / (2 · 40 m)`: najniższy punkt leży 40 m (w poziomie) za końcem strefy lądowania,
  czyli za miejscem, gdzie parabola staje się łagodniejsza niż 32° (reguła wymaga 30 m). Jedna reguła dla każdej
  wielkości: strefa lądowania kończy się na łuku wybiegu, a nie daleko na wolno wypłaszczającej się krzywej tanh,
  co wyprowadzało duże skocznie poza scenę. Gdy zeskok jest tak łagodny, że krzywa osiąga 32° przed tym miejscem,
  wybieg dołącza tam.
- Nachylenie w miejscu złączenia, a więc i parabola do 32° oraz jej łuk, zależą tylko od nachylenia zeskoku. Łuk
  krzywej tanh między dwoma miejscami odległymi od środka o stałą liczbę szerokości jest proporcjonalny do
  szerokości, więc szerokość wynika z jednego dzielenia: łuk krzywej od progu do złączenia plus łuk paraboli do
  końca strefy lądowania ma długość K razy jeden plus część z charakteru. Punkt K to miejsce, gdzie łuk od progu
  osiąga K.
- Gdy K wypada dalej od najbardziej stromego miejsca niż 0,8 granicy reguły stylu (`max(12 m, 0,096 K)`),
  ustępuje strefa lądowania: jej długość jest wyliczana tak, żeby K leżał dokładnie w tej odległości. Garb nie
  ustępuje, bo długi, płaski garb wyrzuca skoczka wysoko nad stok (tak wypadło w próbach: wysokie loty, duży
  rozrzut od wiatru).
- Długość prostej części rozbiegu ustala krótkie, deterministyczne wyszukiwanie: najlepszy skok wyroczni na
  najspokojniejszym ziarnie (`CALM_SEED`) rośnie z długością rozbiegu, więc metoda siecznych z przedziałem
  (wariant Illinois) między rozbiegiem najkrótszym (1 m prostej) a najdłuższym, na jaki pozwalają format
  (koniec prostej najdalej na 150 m) i scena (najniższy punkt wybiegu najdalej na 379 m), szuka skoku w celu z charakteru
  (domyślnie od K+3 do K+8 m). Wyrocznia startuje od gracza odniesienia (`REFERENCE_PLAYER_POLICY`), a nie od wytrenowanego, więc
  skocznie nie zmieniają się po kolejnym treningu.
- Liczby profilu są zaokrąglane (długości do 0,01 m, nachylenia do 0,0001, współczynniki łuków do 0,000001),
  a funkcje przestępne pochodzą z `deterministic-math.ts`, więc wynik jest ten sam w każdym silniku.

### Cele i raport

Cele (`GENERATOR_TARGETS` i reguły gry): najlepszy skok wyroczni w ciszy w celu z charakteru (domyślnie od K+3 do K+8 m), każda reguła
dopuszczenia, każda reguła stylu, każda reguła symulacji (dla skoczni do granicy wiarygodności botów) i odległość
podobieństwa co najmniej `LIKENESS.tooAlike` od każdej skoczni katalogu (`catalog`, domyślnie skocznie własne)
i od skoczni podanych w `others`.

`generateHill` zwraca dane skoczni i raport: najlepszy skok w ciszy i jego odległość od K, długość prostej
rozbiegu, liczbę uruchomień wyroczni, część K strefy lądowania, problemy reguł stylu, czy cel skoku osiągnięto,
czy oceniły ją reguły symulacji i najbliższą skocznię. Kontrole (`checkGeneratedHill`) idą od najtańszej: format,
reguły dopuszczenia, podobieństwo, reguły symulacji. Skocznia, która nie przechodzi formatu, reguły dopuszczenia,
reguły symulacji albo jest za bardzo podobna do innej, to błąd (`HillGenerationError` z listą problemów), nigdy
cichy wynik. Reguły stylu i zakres najlepszego skoku to cele: raport mówi, czy je osiągnięto.

### Zbiór wygenerowany

`src/hills/test-support/generated-hills.ts`: stała lista 27 charakterów od K45 do K260 (trochę poniżej
najmniejszej i powyżej największej skoczni oryginału), generowana po kolei, każda skocznia sprawdzana z poprzednimi,
więc żadne dwie nie są tą samą skocznią. Dziesięć skoczni będących w grze zbiór bierze takie, jakie są
(`SET_HILLS_IN_GAME`; w tabeli 0 uruchomień wyroczni przy wyszukiwaniu, a część K strefy lądowania zmierzona).

Liczby z raportu (bez reguł symulacji, tak jak generuje go trening): nachylenie zeskoku, strefa lądowania za K
z charakteru (w nawiasie: po ustąpieniu do punktu K), położenie belki (m), płaska część za nią (m), cel najlepszego skoku (m za K), wysokość progu nad zeskokiem (m), garb, rozbieg, próg, długość prostej rozbiegu z wyszukiwania (m),
najlepszy skok w ciszy minus K (m), uruchomienia wyroczni, odległość podobieństwa do najbliższej skoczni:

| K | zeskok | strefa za K | garb | rozbieg | próg | belka | płaskie | cel skoku | wys. progu | prosta | najlepszy - K | wyrocznia | podobieństwo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 45 | 37° | 0,25 (0,25) | medium | 46° | 10° | 7,0 | 0,8 | 4..8 | 1,6 | 5,4 | 7,2 | 6 | 2,52 |
| 50 | 39° | 0,30 (0,30) | long | 44° | 11° | 8,0 | 2,5 | 3..7 | 1,6 | 8,9 | 6,3 | 0 | 0,64 |
| 60 | 38° | 0,26 (0,26) | long | 50° | 11° | 12,0 | 2,5 | 5..9 | 2,4 | 7,6 | 6,2 | 5 | 0,99 |
| 60 | 36° | 0,24 (0,24) | medium | 52° | 10° | 18,0 | 0,8 | 3..6 | 2,4 | 5,5 | 5,5 | 0 | 0,47 |
| 70 | 38° | 0,26 (0,26) | medium | 38° | 9° | 11,0 | 5,0 | 3..7 | 2,0 | 24,3 | 7,0 | 0 | 0,79 |
| 75 | 37° | 0,28 (0,28) | short | 55° | 9° | 20,0 | 1,5 | 3..7 | 1,3 | 5,0 | 6,6 | 0 | 0,65 |
| 85 | 41° | 0,20 (0,20) | medium | 47° | 8° | 9,0 | 6,0 | 3..7 | 2,2 | 11,1 | 4,3 | 0 | 1,05 |
| 95 | 39° | 0,24 (0,24) | short | 53° | 10° | 15,0 | 3,5 | 7..11 | 1,3 | 8,6 | 9,7 | 7 | 1,13 |
| 95 | 38° | 0,25 (0,25) | short | 42° | 11° | 14,0 | 2,0 | 7..11 | 1,8 | 29,0 | 9,8 | 0 | 0,66 |
| 100 | 39° | 0,26 (0,26) | medium | 50° | 10° | 28,0 | 3,5 | 6..9 | 2,5 | 15,9 | 6,5 | 0 | 0,76 |
| 105 | 42° | 0,18 (0,21) | medium | 45° | 9° | 7,0 | 1,0 | 4..8 | 1,5 | 18,6 | 5,7 | 0 | 0,71 |
| 115 | 37° | 0,28 (0,28) | short | 53° | 10° | 20,0 | 4,5 | 5..8 | 2,1 | 17,2 | 7,7 | 0 | 1,18 |
| 120 | 39° | 0,26 (0,26) | short | 48° | 9° | 12,0 | 2,8 | 4..8 | 2,0 | 22,1 | 7,0 | 0 | 0,76 |
| 135 | 38° | 0,20 (0,20) | medium | 50° | 10° | 20,0 | 5,0 | 10..14 | 2,2 | 33,1 | 10,3 | 7 | 1,76 |
| 140 | 36° | 0,30 (0,30) | long | 43° | 8° | 8,0 | 6,0 | 10..13 | 1,8 | 98,8 | 11,4 | 5 | 3,86 |
| 150 | 40° | 0,25 (0,25) | short | 45° | 9° | 25,0 | 1,0 | 6..10 | 2,6 | 37,1 | 8,0 | 7 | 1,57 |
| 160 | 37° | 0,18 (0,18) | long | 42° | 11° | 14,0 | 4,5 | 9..12 | 1,4 | 130,7 | 9,7 | 2 | 2,82 |
| 170 | 39° | 0,20 (0,20) | medium | 55° | 10° | 30,0 | 2,0 | 8..12 | 2,1 | 29,9 | 10,8 | 8 | 2,18 |
| 185 | 39° | 0,20 (0,20) | short | 45° | 10° | 18,0 | 7,0 | 11..15 | 1,2 | 71,1 | 13,1 | 6 | 1,20 |
| 200 | 40° | 0,18 (0,18) | short | 47° | 10° | 9,0 | 3,0 | 15..18 | 2,5 | 60,5 | 15,6 | 7 | 1,29 |
| 200 | 41° | 0,20 (0,20) | medium | 48° | 11° | 22,0 | 0,5 | 4..9 | 1,7 | 63,3 | 5,8 | 4 | 0,91 |
| 215 | 42° | 0,15 (0,19) | short | 48° | 11° | 16,0 | 5,5 | 9..13 | 2,3 | 50,7 | 11,0 | 5 | 1,04 |
| 230 | 41° | 0,15 (0,17) | short | 50° | 10° | 13,0 | 1,8 | 13..17 | 1,5 | 60,4 | 14,4 | 6 | 1,44 |
| 230 | 43° | 0,12 (0,17) | medium | 52° | 9° | 11,0 | 4,0 | 6..9 | 1,9 | 45,1 | 8,6 | 8 | 0,97 |
| 245 | 43° | 0,12 (0,19) | short | 52° | 10° | 9,5 | 2,8 | 3..7 | 2,6 | 41,4 | 5,2 | 5 | 1,21 |
| 260 | 45° | 0,12 (0,20) | short | 58° | 9° | 6,5 | 6,5 | 8..12 | 1,3 | 16,8 | 9,5 | 5 | 1,48 |
| 260 | 47° | 0,12 (0,20) | medium | 56° | 10° | 7,5 | 3,2 | 14..18 | 2,2 | 22,0 | 17,6 | 10 | 0,87 |

Każda skocznia spoza gry ma własne położenie belki, płaską część, wysokość progu i cel najlepszego skoku (belka 6,5..30 m, płaska część 0,5..7 m, próg 1,2..2,6 m, cele od K+3..K+7 do K+15..K+18). Rozbiegi mają od 30° do 58°; strome (45° i więcej) są w każdej wielkości: K45 (46°), K60 (50°), K95 (53°), K135 (50°), K150, K170 (55°), K185 i wszystkie od K200. Wszystkie są w celu, bez problemów reguł stylu, a te do K120 przechodzą reguły symulacji; najbliższa para jest
0,51 od siebie (dwie K260). Druga skocznia K120 ma krótki garb: ze średnim garbem nie przechodziła reguły rozrzutu
od wiatru (10,8 m przy dopuszczalnych 9,6 m); reguły nie poluzowano. Duże skocznie mieszczą się w scenie dzięki
wybiegowi dołączającemu na stromej części i łukowi rozbiegu najwyżej 40 m; K260 potrzebują stromego zeskoku
(45..47°) i rozbiegu (56..58°), a prostej zostaje im 16..21 m. Przy łagodniejszych charakterach K200..K260 scena nie
mieści rozbiegu dość długiego, żeby najlepszy skok sięgnął K (raport podaje chybiony cel).

Test jednostkowy generuje najmniejszą skocznię zbioru (z regułami symulacji) i jedną za dużą na scenę (raport
z chybionym celem i strefą lądowania, która ustąpiła). Cały zbiór z regułami symulacji generuje test stabilności
(`corepack pnpm test:hills-stability`).

## Dodanie skoczni

1. Skopiować dane istniejącej skoczni w `src/hills/own-hills.ts`, nadać nowy `id` i nazwę, zmienić liczby.
2. `corepack pnpm test src/hills`: format, reguły geometrii, kontrole symulacją i odcisk (nowy odcisk dopisać do tabeli w teście);
   potem `corepack pnpm test:hills-stability`: ten sam werdykt na rozłącznych próbach.
3. `corepack pnpm test src/render`: kontrole obrazu; nowe klucze migawki pikseli dla nowej skoczni zapisuje
   `corepack pnpm test -u src/render/jump-view.pixels.test.ts`, a w diffie mają się pojawić tylko one.
4. Przejrzeć migawkę pikseli i testy przeglądarkowe, które wskazują skocznię wbudowaną (`e2e/support/app.ts`;
   czasy naciśnięć w `e2e/support/jump-timing.ts` zmierzono na tej skoczni; test
   `src/game/scripted-jump-timing.test.ts` sprawdza, że nadal dają czyste lądowanie z zapasem 0,1 s).
5. Skoczyć na komputerze i na telefonie.
6. Podnieść wersję jak przy każdej zmianie gry.
