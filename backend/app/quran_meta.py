"""Qur'an structural metadata: Juz / Ruku section lookup for logged sessions.

Juz boundaries (30) and ruku boundaries (556, Hafs riwaya) are embedded as
global ayah ids (1..6236 across the whole mushaf). They are cross-verified
from three independent sources:

* Tanzil `quran-data.js` (Ruku / Juz arrays)
* quran-center/quran-meta Hafs lists (`RukuList`, `JuzList`)
* malekverse/quran-dataset (per-ayah `ruko_no`, `juz_no`)

Page numbers follow the standard 604-page Madinah mushaf as used by the app's
`surahs_data.py` (which matches quran.com's official pagination). Because the
app's surah start pages use the "header page" convention, the page -> ayah
mapping is derived from `surahs_data.py` directly so that any session page
range stays consistent with the app's own validation.
"""

import bisect
from functools import lru_cache

from .surahs_data import SURAHS, TOTAL_PAGES

TOTAL_AYAHS = 6236

# RUKU[k] is the first global ayah id of ruku k (1..556). RUKU[0] is a dummy.
RUKU = [
    0, 1, 8, 15, 28, 37, 47, 54, 67, 69,
    79, 90, 94, 104, 111, 120, 129, 137, 149, 155,
    160, 171, 175, 184, 190, 196, 204, 218, 224, 229,
    236, 239, 243, 250, 256, 261, 265, 268, 274, 281,
    289, 291, 294, 303, 314, 324, 335, 348, 357, 365,
    374, 385, 395, 403, 414, 423, 437, 442, 449, 465,
    474, 483, 494, 504, 508, 516, 519, 527, 536, 544,
    553, 564, 570, 581, 585, 590, 594, 598, 606, 609,
    620, 628, 635, 646, 656, 665, 670, 675, 681, 689,
    696, 704, 713, 720, 726, 736, 747, 756, 763, 770,
    778, 785, 790, 800, 810, 820, 831, 840, 845, 850,
    860, 872, 880, 884, 890, 900, 911, 919, 930, 934,
    940, 944, 955, 965, 980, 986, 994, 1002, 1008, 1013,
    1019, 1027, 1039, 1048, 1054, 1063, 1081, 1084, 1096, 1102,
    1106, 1112, 1117, 1126, 1136, 1143, 1161, 1171, 1180, 1189,
    1198, 1205, 1209, 1219, 1225, 1230, 1236, 1242, 1252, 1260,
    1265, 1273, 1278, 1295, 1302, 1308, 1316, 1325, 1335, 1346,
    1354, 1358, 1365, 1375, 1385, 1395, 1405, 1418, 1425, 1435,
    1447, 1457, 1468, 1474, 1482, 1498, 1509, 1523, 1534, 1542,
    1557, 1569, 1583, 1597, 1603, 1617, 1626, 1632, 1639, 1646,
    1654, 1665, 1676, 1690, 1701, 1708, 1715, 1726, 1734, 1739,
    1745, 1751, 1757, 1763, 1772, 1778, 1785, 1792, 1803, 1818,
    1828, 1847, 1863, 1882, 1902, 1911, 1923, 1927, 1936, 1942,
    1952, 1962, 1967, 1972, 1978, 1985, 1991, 2002, 2012, 2021,
    2030, 2040, 2052, 2060, 2070, 2082, 2090, 2100, 2107, 2114,
    2123, 2130, 2141, 2153, 2158, 2163, 2172, 2185, 2190, 2194,
    2200, 2211, 2223, 2242, 2251, 2266, 2291, 2301, 2316, 2333,
    2349, 2373, 2403, 2425, 2438, 2453, 2464, 2477, 2484, 2494,
    2513, 2525, 2534, 2559, 2577, 2596, 2606, 2618, 2621, 2629,
    2634, 2644, 2653, 2660, 2668, 2674, 2696, 2706, 2724, 2751,
    2766, 2792, 2802, 2812, 2818, 2826, 2832, 2842, 2849, 2853,
    2856, 2865, 2876, 2890, 2900, 2916, 2933, 2942, 2966, 2985,
    3002, 3037, 3055, 3073, 3092, 3108, 3124, 3160, 3174, 3191,
    3204, 3218, 3226, 3242, 3253, 3266, 3274, 3281, 3295, 3303,
    3313, 3328, 3341, 3354, 3363, 3371, 3385, 3392, 3404, 3410,
    3420, 3429, 3437, 3450, 3463, 3470, 3481, 3489, 3504, 3515,
    3526, 3534, 3542, 3554, 3561, 3568, 3574, 3586, 3592, 3602,
    3607, 3616, 3628, 3637, 3643, 3652, 3661, 3668, 3675, 3687,
    3698, 3706, 3718, 3738, 3756, 3773, 3789, 3810, 3863, 3902,
    3927, 3971, 3985, 3997, 4011, 4035, 4059, 4068, 4080, 4090,
    4100, 4111, 4122, 4129, 4134, 4143, 4154, 4161, 4171, 4184,
    4194, 4202, 4212, 4219, 4227, 4237, 4244, 4251, 4263, 4273,
    4282, 4292, 4302, 4316, 4326, 4341, 4351, 4361, 4371, 4382,
    4393, 4415, 4444, 4457, 4474, 4485, 4495, 4500, 4511, 4521,
    4531, 4537, 4546, 4557, 4565, 4574, 4584, 4594, 4601, 4610,
    4613, 4623, 4631, 4646, 4660, 4676, 4699, 4722, 4736, 4764,
    4785, 4810, 4817, 4847, 4869, 4887, 4902, 4927, 4947, 4980,
    5018, 5054, 5076, 5086, 5095, 5101, 5105, 5111, 5118, 5127,
    5137, 5144, 5151, 5157, 5164, 5173, 5178, 5186, 5189, 5197,
    5200, 5210, 5218, 5225, 5230, 5237, 5242, 5256, 5272, 5305,
    5324, 5361, 5376, 5411, 5420, 5440, 5448, 5467, 5476, 5495,
    5496, 5527, 5552, 5582, 5592, 5614, 5623, 5663, 5673, 5703,
    5713, 5739, 5759, 5801, 5830, 5849, 5885, 5910, 5932, 5949,
    5968, 5994, 6024, 6044, 6059, 6080, 6091, 6099, 6107, 6126,
    6131, 6139, 6147, 6158, 6169, 6177, 6180, 6189, 6194, 6198,
    6205, 6208, 6214, 6217, 6222, 6226, 6231,
]

# JUZ[k] is the first global ayah id of juz k (1..30). JUZ[0] is a dummy.
JUZ = [
    0, 1, 149, 260, 386, 517, 641, 751, 900, 1042,
    1201, 1328, 1479, 1649, 1803, 2030, 2215, 2484, 2674, 2876,
    3215, 3386, 3564, 3733, 4090, 4265, 4511, 4706, 5105, 5242,
    5673,
]

TOTAL_RUKUS = len(RUKU) - 1
TOTAL_JUZS = len(JUZ) - 1

# Number of rukus per surah (1..114), index 0 is a dummy. Sums to 556.
SURAH_RUKU_COUNT = [
    0, 1, 40, 20, 24, 16, 20, 24, 10, 16,
    11, 10, 12, 6, 7, 6, 16, 12, 12, 6,
    8, 7, 10, 6, 9, 6, 11, 7, 8, 7,
    6, 3, 3, 9, 6, 5, 5, 5, 5, 8,
    9, 6, 5, 7, 3, 4, 4, 4, 4, 2,
    3, 3, 2, 3, 3, 3, 3, 4, 3, 3,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1,
]

# SURAH_START_AYAH[n] is the first global ayah id of surah n (1..114),
# index 0 is a dummy.
SURAH_START_AYAH = [
    0, 1, 8, 294, 494, 670, 790, 955, 1161, 1236,
    1365, 1474, 1597, 1708, 1751, 1803, 1902, 2030, 2141, 2251,
    2349, 2484, 2596, 2674, 2792, 2856, 2933, 3160, 3253, 3341,
    3410, 3470, 3504, 3534, 3607, 3661, 3706, 3789, 3971, 4059,
    4134, 4219, 4273, 4326, 4415, 4474, 4511, 4546, 4584, 4613,
    4631, 4676, 4736, 4785, 4847, 4902, 4980, 5076, 5105, 5127,
    5151, 5164, 5178, 5189, 5200, 5218, 5230, 5242, 5272, 5324,
    5376, 5420, 5448, 5476, 5496, 5552, 5592, 5623, 5673, 5713,
    5759, 5801, 5830, 5849, 5885, 5910, 5932, 5949, 5968, 5994,
    6024, 6044, 6059, 6080, 6091, 6099, 6107, 6126, 6131, 6139,
    6147, 6158, 6169, 6177, 6180, 6189, 6194, 6198, 6205, 6208,
    6214, 6217, 6222, 6226, 6231,
]


@lru_cache(maxsize=None)
def _surah_ayah_count() -> dict[int, int]:
    """Global ayah count per surah number (1..114)."""
    counts: dict[int, int] = {}
    for i in range(1, 115):
        start = SURAH_START_AYAH[i]
        end = SURAH_START_AYAH[i + 1] - 1 if i < 114 else TOTAL_AYAHS
        counts[i] = end - start + 1
    return counts


@lru_cache(maxsize=None)
def page_first_ayah() -> list[int]:
    """First global ayah id of each of the 604 mushaf pages (index 1..604).

    Derived from the app's own surah start-page table so page ranges that the
    app considers valid (per `surahs_data.py`) map into the correct surah.
    Ayahs of each surah are distributed evenly across its page span.
    """
    page_first = [0] * (TOTAL_PAGES + 1)
    counts = _surah_ayah_count()
    global_ayah = 1
    for i, (number, _ar, _en, start_page) in enumerate(SURAHS):
        end_page = (
            SURAHS[i + 1][3] - 1 if i + 1 < len(SURAHS) else TOTAL_PAGES
        )
        if end_page < start_page:
            end_page = start_page
        n_pages = end_page - start_page + 1
        n_ayahs = counts[number]
        q, r = divmod(n_ayahs, n_pages)
        for j in range(n_pages):
            page_first[start_page + j] = global_ayah
            global_ayah += q + (1 if j < r else 0)
    return page_first


_PAGE_FIRST = page_first_ayah()


def surah_global_range(surah_number: int) -> tuple[int, int]:
    """Return the inclusive global ayah id range of a surah."""
    start = SURAH_START_AYAH[surah_number]
    end = SURAH_START_AYAH[surah_number + 1] - 1 if surah_number < 114 else TOTAL_AYAHS
    return start, end


def surah_of_ayah(ayah: int) -> int:
    """Return the surah number (1..114) that a global ayah id belongs to."""
    idx = bisect.bisect_right(SURAH_START_AYAH, ayah) - 1
    return max(1, idx)


def surahs_in_range(first_ayah: int, last_ayah: int) -> list[int]:
    """Surah numbers (1..114) covered by the inclusive global ayah range."""
    numbers: list[int] = []
    n = surah_of_ayah(first_ayah)
    while n <= 114:
        start = SURAH_START_AYAH[n]
        end = SURAH_START_AYAH[n + 1] - 1 if n < 114 else TOTAL_AYAHS
        if end >= first_ayah:
            numbers.append(n)
            if end >= last_ayah:
                break
        n += 1
    return numbers


def juz_ayah_range(juz_num: int) -> tuple[int, int]:
    """Return (first_global_ayah, last_global_ayah) of a juz (1..30)."""
    first = JUZ[juz_num]
    last = JUZ[juz_num + 1] - 1 if juz_num < TOTAL_JUZS else TOTAL_AYAHS
    return first, last


def ayah_global(surah_number: int, ayah_number: int) -> int:
    """Convert (surah, ayah) into a global ayah id (1..6236)."""
    return SURAH_START_AYAH[surah_number] + ayah_number - 1


def section_range(boundaries: list[int], first: int, last: int) -> tuple[int, int]:
    """Return the (start, end) section numbers covering ayahs [first, last].

    `boundaries[k]` is the first ayah of section k; every ayah between two
    boundaries belongs to the lower-numbered section.
    """
    start = max(1, bisect.bisect_right(boundaries, first) - 1)
    end = max(1, bisect.bisect_right(boundaries, last) - 1)
    return start, end


def juz_range(first_ayah: int, last_ayah: int) -> tuple[int, int]:
    """Juz numbers (1..30) covered by the inclusive ayah range."""
    return section_range(JUZ, first_ayah, last_ayah)


def ruku_range(first_ayah: int, last_ayah: int) -> tuple[int, int]:
    """Global ruku numbers (1..556) covered by the inclusive ayah range."""
    return section_range(RUKU, first_ayah, last_ayah)


def _last_ayah_of_page(page: int) -> int:
    if page < TOTAL_PAGES:
        return _PAGE_FIRST[page + 1] - 1
    return TOTAL_AYAHS


@lru_cache(maxsize=4096)
def page_range_meta(
    from_page: int, to_page: int
) -> tuple[int, int, int, int]:
    """Return (juz_from, juz_to, ruku_from, ruku_to) for a page range."""
    first_ayah = _PAGE_FIRST[from_page]
    last_ayah = _last_ayah_of_page(to_page)
    jz = section_range(JUZ, first_ayah, last_ayah)
    rk = section_range(RUKU, first_ayah, last_ayah)
    return jz[0], jz[1], rk[0], rk[1]


def page_of_ayah(ayah: int) -> int:
    """Return the 1-based mushaf page number for a global ayah id."""
    return bisect.bisect_right(_PAGE_FIRST, ayah, 1) - 1


def page_to_surah_number(page: int) -> int:
    """Return the surah number (1..114) for a mushaf page."""
    ayah = _PAGE_FIRST[page]
    idx = bisect.bisect_right(SURAH_START_AYAH, ayah) - 1
    return max(1, idx)


@lru_cache(maxsize=1)
def _surah_number_by_page() -> list[int]:
    result = [0] * (TOTAL_PAGES + 1)
    for i, (number, _ar, _en, start_page) in enumerate(SURAHS):
        end_page = (
            SURAHS[i + 1][3] - 1 if i + 1 < len(SURAHS) else TOTAL_PAGES
        )
        for p in range(start_page, end_page + 1):
            result[p] = number
    return result


SURAH_NUMBER_BY_PAGE = _surah_number_by_page()


def rukus_in_juz(juz_num: int) -> tuple[int, int]:
    """Return (first_ruku, last_ruku) global ruku numbers for a juz (1..30)."""
    first_ayah = JUZ[juz_num]
    last_ayah = JUZ[juz_num + 1] - 1 if juz_num < TOTAL_JUZS else TOTAL_AYAHS
    first_ruku = bisect.bisect_left(RUKU, first_ayah, 1)
    last_ruku = bisect.bisect_right(RUKU, last_ayah, 1) - 1
    return first_ruku, last_ruku


def ruku_page_range(ruku_num: int) -> tuple[int, int]:
    """Return (from_page, to_page) for a global ruku number (1..556)."""
    first_ayah = RUKU[ruku_num]
    last_ayah = RUKU[ruku_num + 1] - 1 if ruku_num < TOTAL_RUKUS else TOTAL_AYAHS
    return page_of_ayah(first_ayah), page_of_ayah(last_ayah)
