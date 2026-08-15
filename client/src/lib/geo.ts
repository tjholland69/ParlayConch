export const US_STATES: string[] = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

export interface ContinentInfo {
  key: string;
  label: string;
  flag: string;
  countries: string[];
}

export const CONTINENTS: ContinentInfo[] = [
  {
    key: "North & Central America",
    label: "North & Central America",
    flag: "🌎",
    countries: [
      "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada",
      "Costa Rica", "Cuba", "Dominica", "Dominican Republic", "El Salvador",
      "Grenada", "Guatemala", "Haiti", "Honduras", "Jamaica", "Mexico",
      "Nicaragua", "Panama", "Saint Kitts and Nevis", "Saint Lucia",
      "Saint Vincent and the Grenadines", "Trinidad and Tobago",
    ],
  },
  {
    key: "South America",
    label: "South America",
    flag: "🌎",
    countries: [
      "Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador",
      "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela",
    ],
  },
  {
    key: "Europe",
    label: "Europe",
    flag: "🌍",
    countries: [
      "Albania", "Andorra", "Austria", "Belarus", "Belgium",
      "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czechia",
      "Denmark", "Estonia", "Finland", "France", "Germany", "Greece",
      "Hungary", "Iceland", "Ireland", "Italy", "Kosovo", "Latvia",
      "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova",
      "Monaco", "Montenegro", "Netherlands", "North Macedonia", "Norway",
      "Poland", "Portugal", "Romania", "San Marino", "Serbia", "Slovakia",
      "Slovenia", "Spain", "Sweden", "Switzerland", "Ukraine",
      "United Kingdom", "Vatican City",
    ],
  },
  {
    key: "Africa",
    label: "Africa",
    flag: "🌍",
    countries: [
      "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
      "Cabo Verde", "Cameroon", "Central African Republic", "Chad",
      "Comoros", "Congo (Brazzaville)", "Congo (Kinshasa)", "Djibouti",
      "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia",
      "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast",
      "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
      "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia",
      "Niger", "Nigeria", "Rwanda", "Sao Tome and Principe", "Senegal",
      "Seychelles", "Sierra Leone", "Somalia", "South Africa", "South Sudan",
      "Sudan", "Tanzania", "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe",
    ],
  },
  {
    key: "Asia",
    label: "Asia",
    flag: "🌏",
    countries: [
      "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh",
      "Bhutan", "Brunei", "Cambodia", "China", "Georgia", "India",
      "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", "Kazakhstan",
      "Kuwait", "Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives",
      "Mongolia", "Myanmar", "Nepal", "North Korea", "Oman", "Pakistan",
      "Palestine", "Philippines", "Qatar", "Saudi Arabia", "Singapore",
      "South Korea", "Sri Lanka", "Syria", "Taiwan", "Tajikistan",
      "Thailand", "Timor-Leste", "Turkey", "Turkmenistan",
      "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",
    ],
  },
  {
    key: "Oceania",
    label: "Oceania",
    flag: "🌏",
    countries: [
      "Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia",
      "Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa",
      "Solomon Islands", "Tonga", "Tuvalu", "Vanuatu",
    ],
  },
];

export interface RegionTile {
  key: string;
  label: string;
  flag: string;
  places: string[];
}

export const REGION_TILES: RegionTile[] = [
  { key: "US", label: "US", flag: "🇺🇸", places: US_STATES },
  ...CONTINENTS.map((c) => ({ key: c.key, label: c.label, flag: c.flag, places: c.countries })),
];
