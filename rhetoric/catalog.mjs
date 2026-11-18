const source = (label, href) => ({label, href});
const book = (title, author, subject, sources, text) => ({title, author, subject, sources, text});

// English study copies are text editions, with their source credits retained.
// Contemporary publications point to the publisher, institution or library.
export const catalog = [
  {
    id: 'aristotle', title: 'Аристотель', books: [
      book('Риторика', 'Аристотель', 'Способы убеждения, виды публичной речи, аргументация и стиль.', [
        source('Перевод Н. Платоновой · сканы 1892–1894', 'https://aristoteles.philosophy.nsc.ru/node/290'),
        source('Издание РГБ · 2015', 'https://search.rsl.ru/ru/record/01008043217')
      ], {file:'rhetoric', translator:'W. Rhys Roberts', href:'https://classics.mit.edu/Aristotle/rhetoric.html'}),
      book('Поэтика', 'Аристотель', 'Устройство трагедии, действие, фабула и характеры.', [
        source('Русский перевод · Викитека', 'https://ru.wikisource.org/wiki/Поэтика_(Аристотель)'),
        source('История русских переводов · ИФПР СО РАН', 'https://aristoteles.philosophy.nsc.ru/node/36')
      ], {file:'poetics', translator:'S. H. Butcher', href:'https://classics.mit.edu/Aristotle/poetics.html'}),
      book('Политика', 'Аристотель', 'Государство, гражданство, формы правления и воспитание.', [
        source('Перевод Н. Скворцова · PDF в НЭБ', 'https://rusneb.ru/catalog/000199_000009_003569444/'),
        source('Русский перевод С. Жебелёва · Викитека', 'https://ru.wikisource.org/wiki/Политика_(Аристотель)')
      ], {file:'politics', translator:'William Ellis', href:'https://www.gutenberg.org/ebooks/6762'}),
      book('Метафизика', 'Аристотель', 'Первые причины, сущность, возможность и действительность.', [
        source('Перевод А. Кубицкого · Викитека', 'https://ru.wikisource.org/wiki/Метафизика_(Аристотель;_Кубицкий)')
      ], {file:'metaphysics', translator:'W. D. Ross', href:'https://classics.mit.edu/Aristotle/metaphysics.html'})
    ]
  },
  {
    id: 'stoics', title: 'Стоики', books: [
      book('Наедине с собой', 'Марк Аврелий', 'Двенадцать книг размышлений о долге, суждениях и самообладании.', [
        source('Перевод С. Роговина · Викитека', 'https://ru.wikisource.org/wiki/Наедине_с_собой_(Марк_Аврелий;_Роговин)')
      ], {file:'meditations', translator:'George Long', href:'https://classics.mit.edu/Antoninus/meditations.html'}),
      book('Энхиридион', 'Эпиктет', 'Краткое руководство о суждениях, желаниях и поступках.', [
        source('Английский текст · Project Gutenberg', 'https://dev.gutenberg.org/cache/epub/45109/pg45109-images.html'),
        source('Русское издание «Основания стоицизма» · 1888', 'https://ru.wikisource.org/wiki/Епиктет._Основания_стоицизма_(Эпиктет)/ДО')
      ], {file:'epictetus', translator:'Thomas Wentworth Higginson', href:'https://dev.gutenberg.org/cache/epub/45109/pg45109-images.html'}),
      book('Беседы и Энхиридион', 'Эпиктет', 'Избранные «Беседы» и руководство в английском переводе Джорджа Лонга.', [
        source('Электронное издание · Project Gutenberg', 'https://www.gutenberg.org/ebooks/10661')
      ]),
      book('Нравственные письма к Луцилию', 'Луций Анней Сенека', 'Письма о времени, дружбе, учении и нравственном выборе.', [
        source('Русское издание в переводе С. Ошерова · РГБ', 'https://search.rsl.ru/ru/record/01007854921')
      ]),
      book('О благодеяниях', 'Луций Анней Сенека', 'Трактат о благодарности, дарах и взаимных обязательствах.', [
        source('Английский текст · Project Gutenberg', 'https://www.gutenberg.org/ebooks/3794')
      ], {file:'seneca', translator:'Aubrey Stewart', href:'https://www.gutenberg.org/ebooks/3794'})
    ]
  },
  {
    id: 'theatre', title: 'Театральные вузы', books: [
      book('Сценическая речь', 'И. Козлянинова, И. Промптова · ГИТИС', 'Учебник по технике и выразительности речи.', [
        source('Издательство ГИТИС', 'https://shop.gitis.net/products/stsenicheskaya-rech-uchebnik')
      ]),
      book('Искусство речи', 'Н. Вербовая, О. Головина, В. Урнова · Щепкинское училище', 'Пособие педагогов Щепкинского училища, изданное ГИТИСом в 2013 году.', [
        source('Официальная картотека училища', 'https://shepkinskoe.ru/library/provision/'),
        source('Карточка издания', 'https://mdk-arbat.ru/book/2419234')
      ]),
      book('Сценическая речь. Вариации для творчества', 'Ю. Васильев · РГИСИ', 'Дикционно-голосовые упражнения и методика работы над сценической речью.', [
        source('Издательство РГИСИ', 'https://www.rgisi.ru/izdatelstvo/2024/09/24/sczenicheskaya-rech.-variaczii-dlya-tvorchestva.-vtoroe-izdanie/')
      ]),
      book('Артистизм и речевая выразительность', 'Л. Алфёрова · РГИСИ', 'Голос, речевая выразительность и применение актёрских упражнений в выступлениях.', [
        source('Издательство РГИСИ', 'https://www.rgisi.ru/izdatelstvo/2024/09/24/artistizm-i-rechevaya-vyirazitelnost-uchebnoe-posobie.-vtoroe-izdanie-%28isprav.%29/')
      ]),
      book('Стихосложение в теории и упражнениях', 'Н. Ковалева · Театральный институт им. Б. Щукина', 'Тренинг чтения стихов и работа с ритмом для сценической речи.', [
        source('Карточка пособия · «Лань»', 'https://lanbook.ru/catalog/stsenicheskie-iskusstva-i-literaturnoe-tvorchestvo/stikhoslozhenie-v-teorii-i-uprazhneniyakh73361549/')
      ])
    ]
  },
  {
    id: 'political', title: 'Политическая риторика', books: [
      book('Политический текст. Психолингвистический анализ воздействия на электорат', 'Е. Репина · каталог ИСТИНА МГУ', 'Монография об анализе языка политических и агитационных текстов.', [
        source('Карточка монографии · ИСТИНА МГУ', 'https://istina.msu.ru/publications/book/570623688/')
      ]),
      book('«Мягкая сила» и публичная дипломатия', 'А. Наумов · Издательство Московского университета', 'Курс лекций о публичной дипломатии и международной коммуникации.', [
        source('Издательство МГУ', 'https://msupress.com/catalogue/books/book/myagkaya-sila-i-publichnaya-diplomatiya/')
      ]),
      book('Аргументация в политической и дипломатической речи: логические ошибки', 'А. Лепенышева · МГИМО', 'Упражнения на анализ аргументации в брифингах, интервью и выступлениях.', [
        source('Издательский дом МГИМО', 'https://dom.mgimo.ru/ru/nauka/publications/textbook/6a9c16fe32807fdbab87cb47/view')
      ]),
      book('Современный политический дискурс: семиотические коды интернет-коммуникации', 'М. Ларионова · МГИМО', 'Монография о том, как политический смысл передаётся в цифровой коммуникации.', [
        source('Издательский дом МГИМО', 'https://dom.mgimo.ru/ru/nauka/publications/monography/6a9c171732807fdbab87d9ac/view')
      ]),
      book('Политические коммуникации', 'Е. Пономарёва · МГИМО', 'Основные формы, методы и инструменты политической коммуникации.', [
        source('Издательский дом МГИМО', 'https://dom.mgimo.ru/ru/nauka/publications/textbook/6a9c16fe32807fdbab87caf1/view')
      ]),
      book('Прагматика политического дискурса', 'Н. Климович · МГИМО · статья', 'Дополнительное чтение о речевых актах и их интерпретации в политических текстах.', [
        source('Читать PDF на сайте МГИМО', 'https://mgimo.ru/upload/iblock/6f4/pragmatika-politicheskogo-diskursa-kommunikativno-lingvisticheskii-instrumentarii-konstruirovaniia-zhelaemogo-obraza.pdf')
      ])
    ]
  }
];
