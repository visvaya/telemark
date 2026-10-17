import type { CountryCode } from "../render/flags";

/**
 * Every text the player sees or hears, in Polish, grouped by where it appears. Texts with a value in them are
 * functions; how the value itself is written (decimal comma, digits) stays with the code that shows it. Texts shown
 * in a frame carry the marks of `typeset` (src/ui/typeset.ts): "|" where a word may be divided, "~" after a
 * one-letter word; ui-text.test.ts lists them.
 */
export const UI_TEXT = {
  appName: "Telemark",
  version: (version: string) => `wersja ${version}`,
  back: "Wstecz",
  /** A hill as the jump view and the page title name it. */
  hillLabel: (name: string, kPointM: number) => `${name} K${kPointM}`,

  pageTitle: {
    hills: "Wybór skoczni",
    outfit: "Strój",
    howTo: "Jak skakać",
    install: "Gra jako aplikacja",
    about: "O grze",
    settings: "Ustawienia",
    replays: "Powtórki",
    competitionSetup: "Konkurs",
    competition: (hillLabel: string) => `Konkurs: ${hillLabel}`,
    jump: (hillLabel: string) => `Skok: ${hillLabel}`,
    /** The screen first, the name of the game after it. */
    withApp: (screen: string, app: string) => `${screen} · ${app}`,
  },

  menu: {
    /** Under the name of the game: what it is, and its version (`versionLabel`), which never breaks apart. */
    tagline: "Skoki jak z DOS-a",
    /** Under the tagline, always in sight: the game this one follows and its author. */
    homage: "Nawiązuje do Deluxe Ski Jump 2 (Mediamond, Jussi Koskela)",
    navigation: "Główne menu",
    training: "Trening",
    competition: "Konkurs",
    replays: "Powtórki",
    outfit: "Strój",
    settings: "Ustawienia",
    howTo: "Jak skakać",
    install: "Gra jako aplikacja",
    about: "O grze",
    loadFiles: "Wczytaj pliki gry",
    quit: "Wyłącz grę",
    /** A framed note: "|" and "~" are the marks of `typeset` (src/ui/typeset.ts). */
    quitRefused:
      "Gra nie może za|mknąć tej kar|ty sama. Za|mknij ją krzy|ży|kiem kar|ty albo kla|wi|sza|mi Ctrl+W. Mo|żesz wyjść z~try|bu peł|no|ekra|no|we|go przy|ci|skiem F11.",
    filesHelp:
      "Skocznie z oryginału: wybierz Dsj.exe ze swojej kopii gry (zawiera skocznie). Dsj.dat jest opcjonalny: daje nazwy z Twojej wersji gry. Plik zostaje w przeglądarce, nic nie jest wysyłane.",
    originalCount: (count: number) => `Skocznie z oryginału: ${count}. `,
    filesRemembered: (withDat: boolean) =>
      `Pliki (${withDat ? "Dsj.exe, Dsj.dat" : "Dsj.exe"}) zapamiętane w tej przeglądarce.`,
    filesNotRemembered: "Ta przeglądarka nie pozwala ich zapamiętać: po zamknięciu strony wybierz je ponownie.",
    filesForgotten: "Zapomniano pliki gry.",
    forgetFiles: "Zapomnij pliki",
    notPersistent: "Przeglądarka nie pozwala zapisywać danych: rekordy znikną po zamknięciu strony.",
    replaysNotStored: "Nie udało się zapisać powtórek: nowe mogą zniknąć po zamknięciu strony.",
  },

  /** A single competition: its setup, the board between jumps and the results. */
  competition: {
    setupTitle: "Konkurs",
    hill: "Skocznia",
    players: "Gracze",
    playerName: (number: number) => `Gracz ${number}`,
    cpus: "Rywale komputerowi",
    /** The levels of the computer jumpers, as the original names them, and its random one last. */
    levels: ["najsłabszy", "słaby", "średni", "dobry", "super", "losowo"],
    levelLabel: (name: string) => `Poziom: ${name}`,
    takesPart: (name: string) => `${name} startuje`,
    watchCpu: "Oglądaj skoki rywali",
    start: "Rozpocznij konkurs",
    nobody: "Włącz co najmniej jednego zawodnika.",
    boardTitle: "Konkurs",
    round: (round: number) => `${round}. seria`,
    lastJumps: "Ostatnie skoki",
    afterRound: (round: number) => `Wyniki po ${round}. serii`,
    finalTitle: "Klasyfikacja końcowa",
    next: (name: string) => `Dalej: skacze ${name}`,
    nextRound: (round: number) => `Rozpocznij ${round}. serię`,
    again: "Jeszcze raz",
    menu: "Menu",
    abandon: "Przerwij konkurs",
    abandonQuestion: "Przerwać konkurs? Wyniki tego konkursu przepadną.",
    abandonYes: "Tak, przerwij",
    abandonNo: "Nie, wróć",
    columns: { place: "Miejsce", name: "Zawodnik", jump: (round: number) => `${round}. seria`, total: "Razem" },
    /** One jump in a table: distance and points. */
    jump: (distance: string, points: string) => `${distance} m, ${points} pkt`,
    fell: "upadek",
    place: (place: number) => `${place}.`,
    noJump: "-",
    total: (points: string) => `${points} pkt`,
    /** One line of the last jumps: who, how far, how many points and the place after it. */
    jumpLine: (name: string, jump: string, place: number) => `${name}: ${jump}, miejsce ${place}.`,
    /** The bar of the jump view: the jumper and the round, in the picture's capitals. */
    hudName: (name: string, round: number) => `${name.toUpperCase()} · ${round}. SERIA`,
    skip: "Pomiń",
    skipKey: " (Enter)",
  },

  /** What the phone shows of the game's sound outside the page (lock screen, control centre). */
  /** A size, kept on one line with its unit. */
  size: {
    kb: (amount: string) => `${amount}\u00a0KB`,
    mb: (amount: string) => `${amount}\u00a0MB`,
  },

  nowPlaying: {
    training: (hillLabel: string) => `Trening: ${hillLabel}`,
  },

  /** The screen for replays of the original game. */
  replays: {
    title: "Powtórki",
    intro:
      "Tu znajdują się powtórki rekordów skoczni, zachowane i ostatnie skoki oraz wczytane powtórki: pliki .rpl z DSJ2 i pliki powtórek tej gry. Rekord skoczni zapisuje się sam; inny skok zachowasz w menu skoku albo powtórki: „Zachowaj ostatni skok”.",
    load: "Wczytaj powtórki (*.rpl, plik powtórek *.json albo archiwum *.zip)",
    needsGame: "Po|wtór|ki z~DSJ2 gra|ją na skocz|niach ory|gi|na|łu: naj|pierw wczy|taj pli|ki gry w~me|nu głów|nym.",
    notReplay: "To nie jest plik po|wtór|ki DSJ2 (.rpl).",
    damaged: "Plik po|wtór|ki jest uszko|dzo|ny: suma kon|trol|na się nie zga|dza.",
    badValues: "Po|wtór|ka ma nie|po|praw|ne dane i~nie da się jej od|two|rzyć.",
    noHill: (hillNumber: number) =>
      `Wczy|ta|ny Dsj.exe nie ma skocz|ni nr ${hillNumber}, z~któ|rej jest ta po|wtór|ka.`,
    groups: { record: "Rekordy skoczni", kept: "Zachowane", recent: "Ostatnie skoki", loaded: "Wczytane" },
    empty: "Nie ma jeszcze zapisanych powtórek.",
    /** One replay of the list: its result, its date and what it weighs. */
    row: (distance: string, points: string, date: string, size: string) =>
      `${distance} · ${points}\u00a0pkt · ${date} · ${size}`,
    /** The day and the time of a replay, kept together on one line. */
    when: (day: string, time: string) => `${day}\u00a0${time}`,
    distance: (metres: string, fell: boolean) => (fell ? `${metres}\u00a0m (upadek)` : `${metres}\u00a0m`),
    watch: "Obejrzyj",
    keep: "Zachowaj",
    kept: "Zachowane",
    remove: "Usuń",
    confirmRemove: "Na pewno usunąć?",
    usage: (count: number, used: string, budget: string) => `Powtórek: ${count}; zajęte ${used} z ${budget}.`,
    removeOldest: "Usuń najstarsze",
    removeOldestCount: "Ile najstarszych usunąć (rekordy zostają)",
    removed: (count: number) => `Usu|nię|to po|wtó|rek: ${count}.`,
    keptFull: "Miej|sce na za|cho|wa|ne po|wtór|ki się skoń|czy|ło (100). Usuń star|sze, że|by za|cho|wać nowe.",
    loadedFull: "Miej|sce na wczy|ta|ne po|wtór|ki się skoń|czy|ło (100). Usuń star|sze, że|by wczy|tać nowe.",
    alreadyKept: "Ten skok jest już zachowany.",
    keptDone: "Za|cho|wa|no.",
    notReady: "Powtórki jeszcze się wczytują; spróbuj za chwilę.",
    removeArmed: "Do|tknij jesz|cze raz „Na pew|no usu|nąć?”, że|by usu|nąć.",
    select: (replay: string) => `Zaznacz: ${replay}`,
    selectAll: "Zaznacz wszystkie",
    selectNone: "Odznacz wszystkie",
    exportSelected: (count: number) => `Eksportuj zaznaczone (${count})`,
    removeSelected: (count: number) => `Usuń zaznaczone (${count})`,
    confirmRemoveSelected: (count: number) => `Na pewno usunąć ${count}?`,
    exportTitle: "Powtórki z gry Telemark",
    exported: {
      shared: "Udo|stęp|nio|no plik z~po|wtór|ka|mi.",
      downloaded: "Za|pi|sa|no plik z~po|wtór|ka|mi.",
      cancelled: "",
    },
    imported: (added: number, already: number) =>
      already === 0
        ? `Wczy|ta|no po|wtó|rek: ${added}.`
        : `Wczy|ta|no po|wtó|rek: ${added}; już za|cho|wa|nych: ${already}.`,
    importUnreadable: (count: number) => `Nie dało się od|czy|tać po|wtó|rek: ${count}.`,
    importSkipped: (count: number) => `Po|mi|nię|te pli|ki, któ|re nie są po|wtór|ka|mi: ${count}.`,
    importUntrue: (count: number) => `Po|mi|nię|te, bo nie gra|ją do wy|ni|ku z~pli|ku: ${count}.`,
    notReplayFile: "To nie jest plik po|wtór|ki DSJ2 (.rpl) ani plik po|wtó|rek tej gry.",
    onlyForVisit: "Ta przeglądarka nie pozwala zapisać powtórek na stałe: znikną po zamknięciu strony.",
    budgetFull: "Po|wtór|ki zaj|mu|ją już całe prze|wi|dzia|ne miej|sce. Usuń star|sze, że|by za|pi|sać nowe.",
    notTrue: "Ta po|wtór|ka nie pa|su|je do tej wer|sji gry albo jest uszko|dzo|na, więc nie da się jej obej|rzeć.",
    hillMissing: "Skocz|ni tej po|wtór|ki nie ma w~grze: wczy|taj pli|ki gry w~me|nu głów|nym.",
    hillRetired:
      "Ta po|wtór|ka jest z~po|przed|nie|go kształ|tu tej skocz|ni, któ|re|go gra już nie ma, więc nie da się jej obej|rzeć. Mo|żesz ją usu|nąć.",
    retiredHill: (hillLabel: string) => `${hillLabel} (dawny kształt)`,
    rplExport: "Eksportuj .rpl",
    rplExportLabel: (replay: string) => `Eksportuj do pliku DSJ2 (.rpl): ${replay}`,
    rplTitle: "Powtórka do DSJ2",
    /** Added when a file plays to the same result, but not frame by frame the same jump. */
    rplApproximate:
      "W~DSJ2 ten skok da ten sam wy|nik, ale ru|chy skocz|ka (na przy|kład po upad|ku) mogą wy|glą|dać tro|chę ina|czej.",
    rplExportSelected: (count: number) => `Eksportuj zaznaczone do .rpl (${count})`,
    rplCheckingMany: (done: number, all: number) => `Spraw|dzam sko|ki do pli|ków DSJ2: ${done} z~${all}…`,
    /** What came of exporting the selected replays to files of the original. */
    rplExportedMany: (
      files: number,
      outcome: "shared" | "downloaded",
      counts: { approximate: number; unfit: number; ownHills: number },
    ) =>
      [
        `${outcome === "shared" ? "Udo|stęp|nio|no" : "Zapisano"} pli|ków .rpl: ${files}${files > 1 ? " (w~archiwum .zip)" : ""}.`,
        counts.approximate > 0
          ? `Z~drob|ną róż|ni|cą w~ru|chach skocz|ka, przy tym sa|mym wy|ni|ku: ${counts.approximate}.`
          : "",
        counts.unfit > 0 ? `Nie dało się za|pi|sać: ${counts.unfit}.` : "",
        counts.ownHills > 0 ? `Po|mi|nię|te, bo ze skocz|ni włas|nych: ${counts.ownHills}.` : "",
        "Sko|piuj je do ka|ta|lo|gu gry DSJ2.",
      ]
        .filter((part) => part !== "")
        .join(" "),
    rplNoneFit: (unfit: number, ownHills: number) =>
      [
        "Żad|ne|go z~za|zna|czo|nych sko|ków nie da się za|pi|sać jako .rpl.",
        unfit > 0 ? `Nie miesz|czą się w~pli|ku DSJ2: ${unfit}.` : "",
        ownHills > 0 ? `Ze skocz|ni włas|nych, któ|rych DSJ2 nie zna: ${ownHills}.` : "",
      ]
        .filter((part) => part !== "")
        .join(" "),
    keepForGood: "Zachowaj na stałe",
    rplExported: {
      shared: "Udo|stęp|nio|no plik .rpl. W~DSJ2 otwo|rzysz go, gdy bę|dzie w~ka|ta|lo|gu gry.",
      downloaded: "Za|pi|sa|no plik .rpl. Sko|piuj go do ka|ta|lo|gu gry DSJ2, że|by go tam obej|rzeć.",
      cancelled: "",
    },
    rplUnfit:
      "Tego sko|ku nie da się za|pi|sać jako .rpl: plik DSJ2 nie mieś|ci wszyst|kich na|ciś|nięć, na któ|re skok za|re|a|go|wał (na przy|kład wy|bi|cia sa|mym pra|wym przy|ci|skiem albo dwóch osob|nych na|ciś|nięć przy wy|bi|ciu).",
    rplUnfitMotion:
      "Tego sko|ku nie da się za|pi|sać jako .rpl: po|chy|la|nie (mysz, pa|lec albo prze|chył), na któ|re skok za|re|a|go|wał, trwa|ło dłu|żej, niż mieś|ci plik DSJ2 (oko|ło 15 s), na przy|kład po upad|ku.",
    rplUnfitDiffers: "Tego sko|ku nie da się za|pi|sać jako .rpl: plik DSJ2 od|two|rzył|by inny skok.",
  },

  gameFiles: {
    datOnly: "Wczytano Dsj.dat. Wybierz jeszcze Dsj.exe: w nim są skocznie.",
    noExe: "Wśród wybranych plików nie ma Dsj.exe.",
    loaded: (count: number) => `Wczytano skocznie: ${count}.`,
    loadedWithNames: (count: number) => `Wczytano skocznie: ${count} (nazwy z Dsj.dat).`,
    unreadable:
      "Nie udało się odczytać plików: to nie są pliki gry Deluxe Ski Jump 2 w wersji 2.10P albo są uszkodzone.",
  },

  hills: {
    title: "Wybierz skocznię do treningu",
    own: "Skocznie własne",
    original: "Skocznie z oryginału",
    kPoint: (kPointM: number) => `K${kPointM}`,
    record: (distance: string) => `rekord ${distance}\u00a0m`,
    watchRecord: "Powtórka",
    watchRecordLabel: (hillLabel: string) => `Powtórka rekordu: ${hillLabel}`,
  },

  flags: {
    unknownCountry: "Kraj nieznany",
    // oxfmt-ignore
    countryName: {
      AT: "Austria", AU: "Australia", BE: "Belgia", BY: "Białoruś", CA: "Kanada", CH: "Szwajcaria", CN: "Chiny",
      CZ: "Czechy", DE: "Niemcy", DK: "Dania", EE: "Estonia", ENG: "Anglia", FI: "Finlandia", FR: "Francja",
      HU: "Węgry", IE: "Irlandia", IS: "Islandia", IT: "Włochy", JP: "Japonia", KR: "Korea", KZ: "Kazachstan",
      LT: "Litwa", LV: "Łotwa", NL: "Holandia", NO: "Norwegia", PL: "Polska", RU: "Rosja", SE: "Szwecja",
      SI: "Słowenia", SK: "Słowacja", UA: "Ukraina", US: "USA",
    } satisfies Readonly<Record<CountryCode, string>>,
  },

  settings: {
    title: "Ustawienia",
    leanTilt: "Pochylanie: przechył",
    leanFinger: "Pochylanie: palec",
    sensitivityGroup: "Czułość sterowania",
    sensitivityDown: "Mniejsza czułość",
    sensitivityUp: "Większa czułość",
    /** What is kept of the replays besides the hill records, and what goes on its own. */
    replays: {
      group: "Ustawienia powtórek",
      recent: (count: number) => (count === 0 ? "Zapisuj ostatnie skoki: wył." : `Zapisuj ostatnie skoki: ${count}`),
      maxAge: "Usuwaj powtórki starsze niż (dni)",
      maxSize: "Usuwaj najstarsze, gdy powtórki ważą więcej niż (MB)",
      recordsStay:
        "Obie zasady usuwają zachowane i wczytane powtórki oraz ostatnie skoki; wiek liczy się od dnia skoku. Rekordów skoczni nie usuwają.",
      sliderOn: "Suwak powtórki: wł.",
      sliderOff: "Suwak powtórki: wył.",
      ghostOn: "Duch rekordu: wł.",
      ghostOff: "Duch rekordu: wył.",
    },
    sensitivity: "Czułość: ",
    scenery: "Pora dnia: ",
    sceneryName: { varied: "zmienna", day: "dzień", dusk: "zmierzch", night: "noc" },
    weather: "Pogoda: ",
    weatherName: { varied: "zmienna", clear: "bez opadów", snow: "śnieg", fog: "mgła", snowFog: "śnieg i mgła" },
    soundOn: "Dźwięk: wł.",
    soundOff: "Dźwięk: wył.",
    hintsOn: "Podpowiedzi na skoczni: wł.",
    hintsOff: "Podpowiedzi na skoczni: wył.",
    fullscreenOn: "Pełny ekran: wł.",
    fullscreenOff: "Pełny ekran: wył.",
    vibrationOn: "Wibracje: wł.",
    vibrationOff: "Wibracje: wył.",
    tiltRefused: "Brak zgody na czujnik ruchu: pochylanie palcem.",
    browserFullscreen: "Ten pełny ekran włączyła przeglądarka. Wyłączysz go klawiszem F11.",
  },

  outfit: {
    title: "Edycja kolorów stroju",
    /** Part labels as in the original's editor. */
    part: { pants: "Spodnie", sleeves: "Rękawy", gloves: "Rękawice", helmet: "Kask", skis: "Narty" },
    swatch: [
      "czarny",
      "szary",
      "oliwkowy",
      "pomarańczowy",
      "brązowy",
      "czerwony",
      "karmazynowy",
      "purpurowy",
      "fioletowy",
      "niebieski",
      "morski",
      "zielony",
    ],
    preview: "Podgląd skoczka w wybranym stroju",
  },

  about: {
    title: "O grze",
    /**
     * Texts set by `typeset` (src/ui/typeset.ts): "~" keeps a one-letter word with the next; the nickname's hyphen
     * is glued to its second half (U+2060), so the name does not break there.
     */
    sections: [
      {
        title: "Czym jest Telemark",
        text: "Telemark to przeglądarkowa gra w~skoki narciarskie. Fizyka skoku jest wiernym odtworzeniem Deluxe Ski Jump~2 (wersja 2.10P na DOS, 2001), przeniesionym z~analizy oryginalnej gry i~sprawdzanym z~nią klatka po klatce. Grafika, interfejs i~dźwięk powstały od nowa, w~duchu oryginału.",
      },
      {
        title: "Podziękowania",
        text: "Ta gra nie powstałaby bez Deluxe Ski Jump. Jussi Koskela stworzył grę, w~której kilka ruchów myszą wystarcza, żeby poczuć lot, a~o~każdy metr trzeba walczyć. Na jego skoczniach wyrosło pokolenie graczy, także w~Polsce. Dziękujemy.",
      },
      {
        title: "Deluxe Ski Jump 2",
        text: "Gra: Jussi Koskela (Mediamond). Zdjęcia: Kalevi Koskela. Polskie tłumaczenie wersji 2.10P: Piotr „V-\u2060car” Wikarek.",
      },
      {
        title: "Telemark",
        text: "Maciej Budzyński. Kod na licencji GPL-3.0-or-later; czcionka Silkscreen na licencji SIL Open Font License 1.1.",
      },
      {
        title: "Niezależny projekt",
        text: "Telemark jest niezależnym projektem, niezwiązanym z~autorami ani wydawcami Deluxe Ski Jump. Pliki oryginalnej gry nie są częścią Telemarka: skocznie oryginału gra czyta z~własnej kopii gracza.",
      },
    ],
  },

  install: {
    title: "Gra jako aplikacja",
    intro: "Telemark można dodać do ekranu głównego telefonu albo zainstalować na komputerze.",
    steps: [
      {
        title: "iPhone i iPad",
        text: "Otwórz grę w Safari, dotknij przycisku Udostępnij (kwadrat ze strzałką w górę), wybierz „Do ekranu początkowego” i potwierdź „Dodaj”.",
      },
      {
        title: "Android",
        text: "W Chrome otwórz menu (trzy kropki) i wybierz „Dodaj do ekranu głównego” albo „Zainstaluj aplikację”.",
      },
      {
        title: "Komputer",
        text: "W Chrome albo Edge kliknij ikonę instalacji na końcu paska adresu albo wybierz w menu przeglądarki pozycję instalacji tej strony.",
      },
      {
        title: "Po instalacji",
        text: "Gra uruchamia się z własnej ikony, bez paska adresu, i działa bez internetu. Pierwszy raz otwórz ją z siecią, żeby pobrała się w całości.",
      },
    ],
  },

  howTo: {
    title: "Jak skakać",
    steering: (name: string) => `Sterowanie: ${name}`,
    steeringName: { mouse: "mysz i klawiatura", touch: "pola L i P", tilt: "przechylanie telefonu" },
    /** The moments of a jump, in the order they come, and what belongs to the screen around it. */
    stepTitles: ["Start", "Wybicie", "Lot", "Telemark", "Lądowanie na dwie nogi", "Następny skok", "Menu"],
    /** One text per step title, per way of steering. */
    steps: {
      mouse: [
        "Kliknij lewym przyciskiem myszy (albo naciśnij Z), gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem naciśnij oba przyciski myszy naraz (albo Z i X) i puść je po wybiciu. Jeden przycisk wybija słabiej.",
        "Ruch myszy do siebie i od siebie pochyla skoczka; to samo robią strzałki w górę i w dół.",
        "Tuż nad ziemią naciśnij lewy albo prawy przycisk; najlepiej około 0,4 sekundy przed lądowaniem. Drugi przycisk naciśnięty zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Naciśnij oba przyciski naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, kliknij lewym przyciskiem albo naciśnij R. Gdy skoczek zatrzyma się na wybiegu, klawisz P pokazuje powtórkę skoku, a S go zachowuje.",
        "Esc otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi. Pełny ekran włączysz w menu albo klawiszem F11 w przeglądarce.",
      ],
      touch: [
        "Dotknij pola L, gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem dotknij pól L i P naraz i puść je po wybiciu. Jedno pole wybija słabiej.",
        "Przesuwaj palec w górę i w dół po polu L. Palec może tam leżeć przez cały lot; możesz go też oderwać i przyłożyć ponownie.",
        "Tuż nad ziemią dotknij pola P; najlepiej około 0,4 sekundy przed lądowaniem. Drugie dotknięcie P zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Dotknij pól L i P naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, dotknij pola L.",
        "Przycisk pauzy w rogu ekranu otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi.",
      ],
      tilt: [
        "Dotknij ekranu, gdy wiatr ci odpowiada. Na start jest 16 sekund.",
        "Tuż przed progiem dotknij ekranu dwoma kciukami naraz i puść je po wybiciu. Jeden kciuk wybija słabiej.",
        "Obracaj telefon do siebie i od siebie: skoczek pochyla się o tyle, o ile obrócisz telefon, i zostaje tak, gdy trzymasz go nieruchomo.",
        "Tuż nad ziemią dotknij ekranu jednym kciukiem; najlepiej około 0,4 sekundy przed lądowaniem. Drugi kciuk przyłożony zaraz po pierwszym daje wąski telemark; im dłuższa przerwa, tym szerszy.",
        "Dotknij ekranu dwoma kciukami naraz. Tak ląduje się pewniej przy bardzo długim skoku, ale noty za styl są niższe.",
        "Gdy pojawią się noty, dotknij ekranu.",
        "Przycisk pauzy w rogu ekranu otwiera menu z ustawieniami i tą instrukcją; gra wtedy stoi.",
      ],
    },
  },

  offline: {
    readiness: {
      preparing: "Przygotowywanie gry bez internetu.",
      ready: "Gotowe do gry bez internetu.",
      unavailable: "Gra bez internetu nie jest jeszcze gotowa.",
    },
    /** A newer release is stored: what the player does to get it, with its version when the worker told it. */
    updateWaiting: (version: string | null) =>
      `${version === null ? "Jest nowa wersja gry." : `Jest nowa wersja gry: ${version}.`} Za|mknij grę cał|ko|wi|cie (wszyst|kie okna, a~na te|le|fo|nie tak|że apli|ka|cję w~prze|łącz|ni|ku apli|ka|cji) i~uru|chom ją po|now|nie, żeby się za|in|sta|lo|wa|ła.`,
    /** The short form beside the button that installs it, in the main menu. */
    updateFound: (version: string | null) =>
      version === null ? "Jest nowa wersja gry." : `Jest nowa wersja gry: ${version}.`,
    /** The way to get it without the button, under it. */
    slowWay: "Albo za|mknij wszyst|kie okna gry i~uru|chom ją po|now|nie.",
    /** The release has taken over from another window; this one still runs the version it started with. */
    updatedElsewhere: "Gra zaktu|a|li|zo|wa|ła się w~in|nym ok|nie: prze|ła|duj, że|by jej uży|wać.",
    reload: "Przeładuj",
    /** Installs the waiting release in this window at once; the page loads again. Then what happens. */
    installNow: "Zainstaluj teraz",
    installing: "In|sta|lu|ję...",
    installFailed: "Nie uda|ło się za|in|sta|lo|wać: spró|buj po|now|nie.",
    /** The check for a new release the player asks for in the main menu, and what it found. */
    check: {
      button: "Szukaj aktualizacji",
      checking: "Sprawdzam...",
      latest: "Masz najnowszą wersję.",
      found: "Jest nowa wersja gry. Pobieram ją.",
      /** The release found could not be stored; the running one stays. */
      downloadFailed: "Nie udało się pobrać nowej wersji: spróbuj później.",
      /** A first visit: the game is still being stored, so there is nothing to compare with yet. */
      saving: "Gra jeszcze się zapisuje.",
      unreachable: "Brak połączenia: nie można sprawdzić.",
      unavailable: "Ta przeglądarka nie pozwala sprawdzić.",
    },
  },

  jumpScreen: {
    pause: "Pauza i ustawienia",
    pauseKey: "ESC: MENU",
    /** `contest`: in a competition the press after the jump goes on to the next jumper. */
    canvas: (hillLabel: string, contest = false) =>
      `Skok na skoczni ${hillLabel}. Lewy przycisk myszy lub Z: start, oba przyciski lub Z i X: wybicie, mysz lub strzałki: pochylenie, przycisk tuż nad ziemią: telemark, drugi przycisk zaraz po pierwszym daje wąski telemark, a później szerszy, oba naraz: lądowanie na dwie nogi, po skoku lewy przycisk: ${contest ? "dalej" : "jeszcze raz"}, P: powtórka, S: zachowanie skoku, Esc: menu z ustawieniami i instrukcją.`,
    resume: "Wróć do gry",
    resumeKey: " (Esc)",
    again: "Skocz jeszcze raz",
    againKey: " (R)",
    /** The keys of watching and keeping the last jump, after the buttons where a keyboard is used. */
    watchKey: " (P)",
    keepKey: " (S)",
    changeHill: "Zmień skocznię",
    exit: "Wyjdź do menu głównego",
    /** Watching the last jump again. */
    replay: {
      watch: "Obejrzyj ostatni skok",
      speed: (speed: string) => `Tempo: ${speed}`,
      fromStart: "Obejrzyj od początku",
      end: "Wróć do skakania",
      resume: "Wróć do powtórki",
      other: "Wróć do powtórek",
      jumpHere: "Skacz na tej skoczni",
      keepLast: "Zachowaj ostatni skok",
      /** Under the two buttons, until the first jump of the visit is over. */
      notYet: "Obejrzysz i zachowasz skok, gdy skoczek zatrzyma się na wybiegu.",
      position: "Moment powtórki",
      positionValue: (now: string, total: string) => `${now} s z ${total} s`,
      positionShort: (now: string, total: string) => `${now} / ${total}\u00a0s`,
      keptLast: "Ostatni skok jest zachowany na ekranie „Powtórki”.",
      alreadyKept: "Ten skok jest już zachowany.",
    },
    /** Asked once where the browser gives the motion sensor only after a tap; tilting is the default. */
    tiltQuestion: "Pochylać skoczka, przechylając telefon? Przeglądarka zapyta o zgodę na czujnik ruchu.",
    tiltYes: "Tak, przechylaniem",
    tiltNo: "Nie, palcem",
    tiltNoSensor: "Telefon nie podaje przechyłu: tym razem pochylanie palcem.",
    /** A suggestion over the jump screen held upright; the game plays either way. */
    turnLandscape: "Obróć telefon poziomo: więcej miejsca na skok.",
    padKey: { left: "L", right: "P" },
    leftPadHints: ["przeciągnij: pochylenie"],
    rightPadHints: ["L+P: wybicie", "P: telemark", "szybko drugie P: wąski telemark", "L+P w locie: dwie nogi"],
    leftPadTilt: "Lewa połowa ekranu: pierwszy kciuk na ekranie to lewy przycisk, drugi to prawy",
    leftPad: "Lewy przycisk: start i wybicie; w locie przesuwanie w pionie pochyla skoczka",
    rightPadTilt: "Prawa połowa ekranu: pierwszy kciuk na ekranie to lewy przycisk, drugi to prawy",
    rightPad: "Prawy przycisk: wybicie razem z lewym; w locie telemark, a razem z lewym lądowanie na dwie nogi",
  },

  /** What a screen reader hears during a jump. */
  announcement: {
    jumpStarted: "Skok rozpoczęty.",
    replayStarted: "Powtórka skoku. Kliknięcie lub dotknięcie obrazu: pauza, Esc: menu.",
    /** Once a replay is over: what a press of the picture does now, after the player's own jump or a file. */
    replayOver: {
      own: "Koniec powtórki. Kliknięcie lub dotknięcie obrazu: nowy skok.",
      original: "Koniec powtórki. Kliknięcie lub dotknięcie obrazu: menu.",
    },
    /** Said once the jumper stands still: from then on the jump can be watched again and kept. */
    replayReady: {
      mouse: "Skok obejrzysz klawiszem P i zachowasz klawiszem S.",
      touch: "Skok obejrzysz i zachowasz w menu.",
      tilt: "Skok obejrzysz i zachowasz w menu.",
    },
    nextJump: {
      mouse: "Lewy przycisk lub R: jeszcze raz.",
      touch: "Pole L: jeszcze raz.",
      tilt: "Dotknięcie ekranu: jeszcze raz.",
    },
    /** In a competition: what moves on to the next jumper once the jump is over. */
    contestNext: {
      mouse: "Lewy przycisk: dalej.",
      touch: "Pole L: dalej.",
      tilt: "Dotknięcie ekranu: dalej.",
    },
    /** Once a competition jump shown again, or a computer jumper's watched jump, is over. */
    contestOver: "Kliknięcie lub dotknięcie obrazu: dalej.",
    record: "Nowy rekord skoczni.",
    disqualified: "Dyskwalifikacja",
    distance: (distance: string) => `${distance} metra`,
    landing: (distance: string) => `Lądowanie: ${distance}`,
    fall: (distance: string) => `Upadek: ${distance}`,
    notes: (notes: string) => `Noty: ${notes}.`,
    points: (points: string) => `Wynik: ${points} punktu.`,
  },

  /** Drawn in the picture of the jump with the pixel font. */
  hud: {
    playerName: "GRACZ 1",
    newRecord: "NOWY REKORD SKOCZNI!",
    disqualified: "DYSKWALIFIKACJA",
    /**
     * Units in small letters, signs of their own in the picture's font (full-width forms): the original's small
     * "m" after a distance, and in its style "km/h" and "pkt"; a thin space (U+2009) parts each from its number.
     */
    distance: (distance: string) => `${distance}\u2009ｍ`,
    speed: (speed: string) => `${speed}\u2009ｋｍ／ｈ`,
    /** Points after a jump, named so the number in the bar is not taken for another distance. */
    points: (points: string) => `${points}\u2009ｐｋｔ`,
    /** A replay, with its tempo (1, 1/2, 1/4); the second while it is paused. */
    replay: (speed: string) => `POWTÓRKA ${speed}`,
    replayPaused: (speed: string) => `POWTÓRKA ${speed}: PAUZA`,
    phase: {
      crash: "UPADEK",
      gate: "BELKA",
      inrun: "NAJAZD",
      takeoff: "WYBICIE",
      flight: "LOT",
      landing: "LĄDOWANIE",
      outrun: "WYBIEG",
    },
    prompts: {
      mouse: {
        replay: "KLIKNIJ: PAUZA   ESC: MENU",
        replayMenu: "KLIKNIJ: MENU",
        nextJump: "KLIKNIJ: JESZCZE RAZ   ESC: MENU",
        /** Under the prompt for the next jump, once the jumper stands still and the jump can be watched and kept. */
        replayReady: "P: OBEJRZYJ · S: ZACHOWAJ",
        start: "LEWY PRZYCISK: START",
        takeoff: "OBA PRZYCISKI NA PROGU",
        lean: "MYSZ: POCHYLENIE",
        telemark: "PRZYCISK TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO DRUGI PRZYCISK: WĄSKI TELEMARK",
        twoFeet: "OBA NARAZ: NA DWIE NOGI",
      },
      touch: {
        replay: "DOTKNIJ OBRAZU: PAUZA",
        replayMenu: "DOTKNIJ OBRAZU: MENU",
        nextJump: "L: JESZCZE RAZ",
        replayReady: "W MENU: OBEJRZYJ LUB ZACHOWAJ SKOK",
        start: "L: START",
        takeoff: "L+P NA PROGU: WYBICIE",
        lean: "PRZECIĄGAJ W POLU L: POCHYLENIE",
        telemark: "P TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO ZNOWU P: WĄSKI TELEMARK",
        twoFeet: "L+P: NA DWIE NOGI",
      },
      tilt: {
        replay: "DOTKNIJ OBRAZU: PAUZA",
        replayMenu: "DOTKNIJ OBRAZU: MENU",
        nextJump: "DOTKNIJ EKRANU: JESZCZE RAZ",
        replayReady: "W MENU: OBEJRZYJ LUB ZACHOWAJ SKOK",
        start: "DOTKNIJ EKRANU: START",
        takeoff: "DWA KCIUKI NA PROGU: WYBICIE",
        lean: "PRZECHYLAJ TELEFON: POCHYLENIE",
        telemark: "KCIUK TUŻ NAD ZIEMIĄ: TELEMARK",
        width: "SZYBKO DRUGI: WĄSKI TELEMARK",
        twoFeet: "DWA KCIUKI NARAZ: NA DWIE NOGI",
      },
    },
  },

  /** The `?diag` overlay over the jump. */
  diagnostics: {
    rate: (framesPerS: string, versionLabel: string) => `${framesPerS} kl./s · ${versionLabel}`,
    interval: (spread: string) => `klatka ${spread} ms`,
    cost: (sim: string, draw: string) => `sym. ${sim} · rys. ${draw} ms`,
    losses: (dropped: string, long: number) => `zgubione kroki ${dropped} · długie klatki ${long}`,
  },
} as const;
