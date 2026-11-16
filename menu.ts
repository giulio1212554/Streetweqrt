/**
 * ============================================================
 *  MENU DEL RISTORANTE — modifica solo questo file
 * ============================================================
 *
 * Come fare:
 * 1. Cambia nome, descrizione, prezzo delle voci
 * 2. Aggiungi o togli piatti nelle liste "items"
 * 3. Salva il file e ricarica il sito (npm run dev)
 *
 * price: stringa libera, es. "12" oppure "12 €" oppure "su richiesta"
 * desc:  opzionale, lascia "" se non serve
 */

export type MenuItem = {
  name: string;
  price: string;
  desc?: string;
};

export type MenuSection = {
  title: string;
  items: MenuItem[];
};

export const MENU_NOTE =
  "Cucina della tradizione ischitana. I prezzi possono variare in base alla stagione. Per allergeni chiedi allo staff.";

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: "Antipasti",
    items: [
      {
        name: "Antipasto della casa",
        price: "14",
        desc: "Selezione di salumi, formaggi e sottoli locali",
      },
      {
        name: "Insalata di mare",
        price: "16",
        desc: "Pesce fresco, limone e olio EVO",
      },
      {
        name: "Bruschette miste",
        price: "8",
        desc: "Pomodoro, olive, alici",
      },
    ],
  },
  {
    title: "Primi",
    items: [
      {
        name: "Bucatini al sugo di coniglio",
        price: "14",
        desc: "Classico della cucina ischitana",
      },
      {
        name: "Spaghetti alle vongole",
        price: "16",
        desc: "Vongole veraci, aglio e prezzemolo",
      },
      {
        name: "Paccheri ai frutti di mare",
        price: "18",
      },
    ],
  },
  {
    title: "Secondi",
    items: [
      {
        name: "Coniglio all'ischitana",
        price: "22",
        desc: "Il piatto simbolo del locale",
      },
      {
        name: "Pesce del giorno",
        price: "su richiesta",
        desc: "Secondo disponibilità del mercato",
      },
      {
        name: "Grigliata mista di carne",
        price: "20",
      },
    ],
  },
  {
    title: "Contorni",
    items: [
      { name: "Patate al forno", price: "5" },
      { name: "Insalata mista", price: "5" },
      { name: "Verdure di stagione", price: "6" },
    ],
  },
  {
    title: "Dolci",
    items: [
      { name: "Tiramisù della casa", price: "6" },
      { name: "Caprese al limone", price: "6" },
      { name: "Frutta fresca", price: "5" },
    ],
  },
  {
    title: "Bevande",
    items: [
      { name: "Acqua 1L", price: "2" },
      { name: "Vino della casa (mezzo litro)", price: "8" },
      { name: "Birra artigianale", price: "5" },
      { name: "Caffè", price: "1,50" },
    ],
  },
];
