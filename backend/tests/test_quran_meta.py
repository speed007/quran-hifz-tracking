from backend.app.quran_meta import (
    TOTAL_AYAHS,
    TOTAL_JUZS,
    TOTAL_RUKUS,
    JUZ,
    RUKU,
    SURAH_RUKU_COUNT,
    ayah_global,
    juz_range,
    page_first_ayah,
    page_range_meta,
    ruku_range,
    surah_global_range,
)


def test_totals_are_verified():
    assert TOTAL_RUKUS == 556
    assert TOTAL_JUZS == 30
    assert TOTAL_AYAHS == 6236
    assert len(RUKU) == TOTAL_RUKUS + 1
    assert len(JUZ) == TOTAL_JUZS + 1


def test_surah_ruku_counts_sum_to_556():
    assert len(SURAH_RUKU_COUNT) == 115
    assert sum(SURAH_RUKU_COUNT) == 556
    assert SURAH_RUKU_COUNT[1] == 1
    assert SURAH_RUKU_COUNT[2] == 40


def test_ayah_global():
    assert ayah_global(1, 1) == 1
    assert ayah_global(2, 1) == 8
    assert ayah_global(36, 1) == 3706


def test_surah_global_range():
    assert surah_global_range(1) == (1, 7)
    assert surah_global_range(36) == (3706, 3788)
    assert surah_global_range(114) == (6231, 6236)


def test_ruku_range():
    assert ruku_range(1, 7) == (1, 1)
    assert ruku_range(8, 14) == (2, 2)
    assert ruku_range(3706, 3747) == (381, 383)
    assert ruku_range(6231, 6236) == (556, 556)


def test_juz_range():
    assert juz_range(1, 148) == (1, 1)
    assert juz_range(1, 149) == (1, 2)
    assert juz_range(5105, 5242) == (28, 29)
    assert juz_range(6231, 6236) == (30, 30)


def test_page_first_ayah_spot_checks():
    pf = page_first_ayah()
    assert pf[1] == 1
    assert pf[2] == 8
    assert pf[50] == 294
    assert pf[106] == 670
    assert pf[107] == 676
    assert pf[440] == 3706
    assert pf[604] == 6231


def test_page_range_meta_covers_single_and_multi_ruku():
    assert page_range_meta(36, 440, 442) == (22, 23, 381, 383)
    assert page_range_meta(36, 440, 441) == (22, 23, 381, 382)
    assert page_range_meta(1, 1, 1) == (1, 1, 1, 1)
