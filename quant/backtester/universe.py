"""Built-in SGX ticker watchlist (STI 30 constituents, .SI suffix for yfinance).

This is a convenience picklist for the interactive CLI, not a hard restriction
— users can always type their own .SI tickers.
"""

import re

# Well-known SGX blue chips, most of them STI constituents. NOT guaranteed to
# be the exact current STI 30 list — index membership changes over time and
# should be re-verified against SGX/STI's official list before relying on this
# for anything beyond picking convenient tickers in the CLI.
STI_WATCHLIST = {
    "D05.SI": "DBS Group Holdings",
    "O39.SI": "OCBC Bank",
    "U11.SI": "United Overseas Bank",
    "Z74.SI": "Singtel",
    "C38U.SI": "CapitaLand Integrated Commercial Trust",
    "A17U.SI": "CapitaLand Ascendas REIT",
    "C09.SI": "City Developments",
    "C52.SI": "ComfortDelGro",
    "G13.SI": "Genting Singapore",
    "H78.SI": "Hongkong Land Holdings",
    "BN4.SI": "Keppel Ltd",
    "9CI.SI": "CapitaLand Investment",
    "S68.SI": "Singapore Exchange (SGX)",
    "C6L.SI": "Singapore Airlines",
    "Y92.SI": "Thai Beverage",
    "U96.SI": "Sembcorp Industries",
    "S58.SI": "SATS",
    "BS6.SI": "Yangzijiang Shipbuilding",
    "ME8U.SI": "Mapletree Industrial Trust",
    "M44U.SI": "Mapletree Logistics Trust",
    "N2IU.SI": "Mapletree Pan Asia Commercial Trust",
    "AJBU.SI": "Keppel DC REIT",
    "F34.SI": "Wilmar International",
    "V03.SI": "Venture Corporation",
    "S63.SI": "ST Engineering",
    "BUOU.SI": "Frasers Logistics & Commercial Trust",
}

_SI_TICKER_RE = re.compile(r"^[A-Z0-9]{1,5}U?\.SI$")


def is_valid_si_ticker(ticker: str) -> bool:
    """Loose sanity check for a yfinance-style SGX ticker, e.g. 'D05.SI'."""
    return bool(_SI_TICKER_RE.match(ticker.strip().upper()))
