const source = (label, href) => ({label, href});
const book = (title, author, subject, sources, text) => ({title, author, subject, sources, text});

const edition = (file, translator, href) => ({file, translator, href});
const wiki = title => 'https://ru.wikisource.org/wiki/' + title;
const translation = (name, translator, href) => edition(name, 'Перевод ' + translator, href);

export const catalog = [
  {
    id: 'aristotle', title: 'Аристотель', books: [
      book('Риторика', 'Аристотель', 'Способы убеждения, виды публичной речи, аргументация и стиль.', [
        source('Сканы публикации 1892–1894 гг. · ИФПР СО РАН', 'https://aristoteles.philosophy.nsc.ru/node/290')
      ], translation('rhetoric', 'Н. Платоновой', 'https://lib.ru/POEEAST/ARISTOTEL/ritoriki.txt')),
      book('Поэтика', 'Аристотель', 'Устройство трагедии, действие, фабула и характеры.', [
        source('Скан издания 1927 года', 'https://imwerden.de/pdf/aristotel_poetika_academia_1927__ocr.pdf')
      ], translation('poetics', 'Н. Новосадского', wiki('Поэтика_(Аристотель)'))),
      book('Политика', 'Аристотель', 'Государство, гражданство, формы правления и воспитание.', [
        source('Перевод Н. Скворцова · НЭБ', 'https://rusneb.ru/catalog/000199_000009_003569444/')
      ], translation('politics', 'С. Жебелёва', 'https://grachev62.narod.ru/aristotel/contents.html')),
      book('Метафизика', 'Аристотель', 'Первые причины, сущность, возможность и действительность.', [],
        translation('metaphysics', 'А. Кубицкого', wiki('Метафизика_(Аристотель;_Кубицкий)')))
    ]
  },
  {
    id: 'stoics', title: 'Стоики', books: [
      book('Наедине с собой', 'Марк Аврелий', 'Двенадцать книг размышлений о долге, суждениях и самообладании.', [],
        translation('meditations', 'С. Роговина', wiki('Наедине_с_собой_(Марк_Аврелий;_Роговин)'))),
      book('Основания стоицизма', 'Эпиктет · Арриан', 'Русское издание «Энхиридиона» 1888 года.', [
        source('Историческое издание 1767 года · НЭБ', 'https://kp.rusneb.ru/item/material/epiktita-stoicheskago-filosofa-enhiridion-i-apoffegmy')
      ], translation('epictetus', 'В. Алексеева', 'https://www.psylib.org.ua/books/_arria01.htm')),
      book('Нравственные письма к Луцилию', 'Луций Анней Сенека', 'Письма о времени, дружбе, учении и нравственном выборе.', [
        source('Русское издание в переводе С. Ошерова · РГБ', 'https://search.rsl.ru/ru/record/01007854921')
      ]),
      book('О благодеяниях', 'Луций Анней Сенека', 'Семь книг о благодарности, дарах и взаимных обязательствах.', [],
        edition('seneca', 'Перевод 1889–1897 гг., приписывается П. Краснову', 'https://ancientrome.ru/antlitr/seneca/'))
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
