/**
 * Сопоставление текста с маркерами учебного дела.
 *
 * Оценка качества расследования обязана быть воспроизводимой: один и тот же прогон,
 * оценённый дважды, должен дать один и тот же результат. Поэтому ground truth задаётся
 * не «похожими по смыслу» формулировками, а списками маркеров — фрагментов слов,
 * присутствие которых в тексте проверяется механически.
 *
 * Ограничение метода честнее скрытой «семантической близости»: если факт сформулирован
 * иначе и маркеры его не поймали, метрика покажет пропуск, и это видно автору учебного
 * дела. Молчаливое «примерно совпало» не показывает ничего.
 */

/** Приводит текст к виду, пригодному для механического сравнения. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Все маркеры группы должны присутствовать в тексте. Пустая группа не совпадает ни с чем:
 * иначе учебное дело с забытыми маркерами показывало бы стопроцентную полноту.
 *
 * @param {string} text
 * @param {string[]} markers
 * @returns {boolean}
 */
export function matchesAll(text, markers) {
  if (!Array.isArray(markers) || markers.length === 0) return false;
  const haystack = normalize(text);
  return markers.every((marker) => haystack.includes(normalize(marker)));
}

/**
 * Совпадение хотя бы с одной группой маркеров.
 *
 * @param {string} text
 * @param {string[][]} groups
 * @returns {boolean}
 */
export function matchesAny(text, groups) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.some((group) => matchesAll(text, group));
}

/**
 * Ищет в наборе текстов первый, совпавший со всеми маркерами.
 *
 * @param {Array<{id?: string, text: string, ref?: any}>} candidates
 * @param {string[]} markers
 */
export function findMatch(candidates, markers) {
  return candidates.find((candidate) => matchesAll(candidate.text, markers)) ?? null;
}

/** Фамилия как опорная часть имени: она устойчивее полного написания. */
export function surnameOf(fullName) {
  return normalize(fullName).split(' ')[0] ?? '';
}

/**
 * Текст называет человека, если содержит его фамилию как отдельное слово.
 * Проверка по границам слова, а не по подстроке: «Иванова» и «Иванов» — разные люди,
 * но «Иванову» и «Иванов» — один, поэтому граница ищется только слева и по началу слова.
 */
export function namesPerson(text, fullName) {
  const surname = surnameOf(fullName);
  if (surname.length < 3) return false;
  return new RegExp(`(^|[^а-яa-z])${surname}`, 'i').test(normalize(text));
}
