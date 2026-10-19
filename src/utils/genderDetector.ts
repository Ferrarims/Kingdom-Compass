export type Gender = 'female' | 'male';

const FEMALE_NAMES = new Set([
  'ana', 'maria', 'julia', 'júlia', 'juliana', 'fernanda', 'daniele', 'daniela', 'dani',
  'sofia', 'sophia', 'marina', 'camila', 'kamila', 'beatriz', 'bruna', 'larissa', 'patricia',
  'patrícia', 'vanessa', 'leticia', 'letícia', 'carolina', 'carol', 'jessica', 'jessica',
  'amanda', 'paula', 'luciana', 'carla', 'raquel', 'aline', 'simone', 'inês', 'isabel',
  'alice', 'nicole', 'nicolle', 'luiza', 'luísa', 'gabriela', 'gabi', 'gabrielly', 'mariana',
  'rafaela', 'rafaella', 'renata', 'debora', 'débora', 'isabela', 'isabella', 'vitoria',
  'vitória', 'barbara', 'bárbara', 'flavia', 'flávia', 'bianca', 'claudia', 'cláudia',
  'cristiane', 'erika', 'érika', 'fabiana', 'giovanna', 'giovana', 'helena', 'elena', 'laura',
  'luana', 'marcela', 'natalia', 'natália', 'priscila', 'priscylla', 'sabrina', 'tatiana',
  'tati', 'camilla', 'denise', 'elis', 'eliza', 'emanuelle', 'evelyn', 'fatima', 'fátima',
  'florence', 'franciele', 'geovanna', 'gisele', 'giselle', 'giulia', 'glaucia', 'isadora',
  'jaqueline', 'joana', 'karen', 'karina', 'karla', 'katia', 'kátia', 'laís', 'lais', 'lara',
  'lívia', 'livia', 'lorena', 'lúcia', 'lucia', 'ludmila', 'maira', 'maíra', 'maite', 'maitê',
  'manuela', 'manu', 'margarida', 'marianne', 'marlene', 'martha', 'marta', 'mayara', 'melissa',
  'mel', 'michele', 'michelle', 'milena', 'mirella', 'monica', 'mônica', 'monique', 'naira',
  'nayana', 'nicolle', 'olivia', 'olívia', 'paloma', 'pamela', 'pâmela', 'paola', 'poliana',
  'polyana', 'rayane', 'rebeca', 'rita', 'rosana', 'rosangela', 'rose', 'samara', 'sandra',
  'sheila', 'silvia', 'sílvia', 'sonia', 'sônia', 'sueli', 'suellen', 'suzana', 'tais',
  'taís', 'talita', 'tamires', 'tania', 'tânia', 'teresa', 'tereza', 'thaís', 'thais',
  'valeria', 'valéria', 'veronica', 'verônica', 'vivian', 'viviane', 'yasmin', 'yasmim',
  'adrianne', 'adriana', 'agatha', 'ágatha', 'alessandra', 'alícia', 'alicia', 'amália',
  'amalia', 'amélia', 'anabel', 'andreia', 'andréia', 'andressa', 'angelica', 'angélica',
  'angelita', 'anita', 'antonia', 'antônia', 'ariane', 'ariel', 'arlete', 'astrid', 'aurea',
  'áurea', 'aurora', 'bernadete', 'beth', 'betânia', 'betania', 'branda', 'brenda', 'bridget',
  'brigitte', 'bruna', 'cacilda', 'candida', 'cândida', 'carem', 'caren', 'carina', 'carine',
  'carmem', 'carmen', 'carolina', 'caroline', 'cassia', 'cássia', 'cecilia', 'cecília',
  'celeste', 'celia', 'célia', 'celina', 'charlotte', 'cintia', 'cíntia', 'clara', 'clarice',
  'clarissa', 'claudia', 'cleide', 'cleo', 'cléo', 'conceicao', 'conceição', 'cora', 'corina',
  'cristina', 'dagmar', 'daiana', 'daiane', 'dalva', 'daniela', 'daniele', 'daniella',
  'dora', 'doris', 'dóris', 'dulce', 'edna', 'elaine', 'elba', 'elena', 'eliana', 'eliane',
  'elisa', 'elisabeth', 'elisabete', 'elizabeth', 'elza', 'emilia', 'emília', 'emily',
  'esmeralda', 'ester', 'esther', 'eugenia', 'eugênia', 'eulalia', 'eulália', 'eva', 'evangelina',
  'evelin', 'fabia', 'fábia', 'fabiola', 'fabíola', 'fatima', 'felipa', 'fernanda', 'filipa',
  'flavia', 'flora', 'francisca', 'gabriela', 'georgina', 'gerusa', 'gilda', 'giovanna',
  'gisela', 'gisele', 'glaucia', 'gloria', 'glória', 'graca', 'graça', 'graciela', 'graziela',
  'guilda', 'heitora', 'helena', 'heloisa', 'heloísa', 'iara', 'ines', 'inês', 'ingrid',
  'iracema', 'irene', 'iris', 'íris', 'isabel', 'isabela', 'isabelly', 'isadora', 'isaura',
  'isolda', 'ivana', 'ivanete', 'ivone', 'ivoni', 'izabel', 'izabela', 'jacira', 'jamilly',
  'jamile', 'janaina', 'janaína', 'jandira', 'janete', 'janice', 'jaqueline', 'jessica',
  'joana', 'jocelyn', 'joelma', 'johanna', 'jordana', 'josefa', 'josefina', 'jucemara',
  'judi', 'judite', 'judith', 'jujuba', 'julia', 'juliana', 'julieta', 'jussara', 'karen',
  'karin', 'karina', 'karine', 'karla', 'kasia', 'katarina', 'katherine', 'katia', 'keila',
  'kelly', 'kely', 'kirsten', 'laís', 'lara', 'larissa', 'laura', 'lauren', 'lavinia',
  'lavínia', 'lea', 'légia', 'leila', 'elia', 'elia', 'lia', 'liana', 'licia', 'lícia',
  'ligia', 'lígia', 'lila', 'lilia', 'lília', 'lilian', 'liliana', 'linda', 'lisa', 'livia',
  'lorena', 'lourdes', 'luana', 'luara', 'lucia', 'luciana', 'lucie', 'luciene', 'lucila',
  'lucinda', 'lucrecia', 'lucrécia', 'ludmila', 'luisa', 'luiza', 'luzia', 'lydia', 'mabel',
  'madalena', 'magali', 'magda', 'maira', 'maisa', 'maísa', 'maite', 'malu', 'manuela',
  'mara', 'marcela', 'marcelina', 'marcia', 'márcia', 'margarete', 'margarida', 'margarita',
  'maria', 'mariah', 'mariam', 'mariana', 'mariane', 'marilda', 'marilena', 'marilia', 'marília',
  'marilu', 'marina', 'marinete', 'marisa', 'marisela', 'marisol', 'maristela', 'marlene',
  'marli', 'marta', 'martha', 'mary', 'matilde', 'maura', 'mayara', 'mayra', 'maysa',
  'meire', 'melania', 'melâna', 'melina', 'melissa', 'mercedes', 'michele', 'michelle',
  'milena', 'mirela', 'mirella', 'miriam', 'míriam', 'mirian', 'monica', 'monique', 'nádia',
  'nadia', 'najla', 'nanci', 'nancy', 'naomi', 'natalia', 'natasha', 'nathalia', 'nayana',
  'nayara', 'neide', 'nelia', 'nelson', 'nelza', 'nicolle', 'nidia', 'nilza', 'nina',
  'noelia', 'noemia', 'noêmia', 'nora', 'nrma', 'norma', 'nubia', 'núbia', 'odete', 'ofelia',
  'ofélia', 'olga', 'olimpia', 'olímpia', 'olivia', 'osvalda', 'otilia', 'otília', 'paloma',
  'pamela', 'paola', 'patricia', 'paula', 'paulina', 'penelope', 'penélope', 'perla', 'perpetua',
  'pola', 'poliana', 'priscila', 'rachel', 'rafaela', 'raimunda', 'raissa', 'raíssa', 'raquel',
  'rayane', 'rebeca', 'regina', 'renata', 'rita', 'roberta', 'rosa', 'rosalia', 'rosália',
  'rosana', 'rosangela', 'rosani', 'rose', 'rosemere', 'rosemari', 'roseneide', 'rosely',
  'rosemary', 'rosina', 'rubia', 'rúbia', 'ruth', 'sabrina', 'samanta', 'samantha', 'samara',
  'sandra', 'sara', 'sarah', 'selma', 'serena', 'severina', 'sheila', 'sheyla', 'shirley',
  'silvana', 'silvia', 'simone', 'socorro', 'sofia', 'solange', 'sonia', 'stefany', 'stella',
  'sueli', 'suely', 'suelen', 'suellen', 'susana', 'suzana', 'suzane', 'tania', 'tatiana',
  'tatiane', 'taís', 'teresa', 'tereza', 'terezinha', 'thaís', 'thays', 'uma', 'uschi',
  'valeria', 'valesca', 'valeska', 'vanda', 'vanessa', 'vanusa', 'veronica', 'vick', 'vicky',
  'victoria', 'victória', 'vilma', 'violeta', 'virginia', 'virgínia', 'vitoria', 'vivian',
  'viviane', 'waleska', 'wanda', 'yara', 'yasmin', 'yolanda', 'yvonne', 'zilda', 'zuleica'
]);

const MALE_NAMES = new Set([
  'fernando', 'carlos', 'pedro', 'joao', 'joão', 'lucas', 'mateus', 'matheus', 'gabriel',
  'rodrigo', 'marcelo', 'rafael', 'bruno', 'paulo', 'diego', 'diogo', 'thiago', 'tiago',
  'felipe', 'leonardo', 'gustavo', 'daniel', 'andre', 'andré', 'marcos', 'marco', 'guilherme',
  'vinicius', 'vinícius', 'eduardo', 'victor', 'vitor', 'vítor', 'alex', 'allan', 'alan',
  'arthur', 'artur', 'bernardo', 'caio', 'cesar', 'césar', 'david', 'danilo', 'douglas',
  'enio', 'enzo', 'erico', 'érico', 'fabio', 'fábio', 'fabricio', 'fabrício', 'francisco',
  'heitor', 'henrique', 'igor', 'ivan', 'jackson', 'jaime', 'jean', 'jorge', 'jose', 'josé',
  'julio', 'júlio', 'leandro', 'luis', 'luís', 'luiz', 'luíz', 'marcio', 'márcio', 'mario',
  'mário', 'mauricio', 'maurício', 'miguel', 'murilo', 'otavio', 'otávio', 'pablo', 'ruan',
  'rhuan', 'samuel', 'sergio', 'sérgio', 'theo', 'théo', 'thomas', 'tomás', 'tomas', 'valter',
  'walter', 'willian', 'william', 'yago', 'yuri', 'adrian', 'adriano', 'afonso', 'alberto',
  'alessandro', 'alvaro', 'álvaro', 'américo', 'anderson', 'antonio', 'antônio', 'augusto',
  'benicio', 'benício', 'bento', 'brenno', 'breno', 'claudio', 'cláudio', 'cristian',
  'cristiano', 'dante', 'davi', 'dener', 'dennis', 'denis', 'dionisio', 'edson', 'elias',
  'emanuel', 'emilio', 'emílio', 'erick', 'eric', 'everton', 'feliphe', 'fernandinho',
  'flavio', 'flávio', 'fred', 'frederico', 'gabryel', 'geovane', 'gerson', 'gilberto',
  'giovanni', 'gregorio', 'helio', 'hélio', 'hugo', 'ian', 'icaro', 'ícaro', 'isac', 'isaac',
  'isaias', 'isaías', 'israel', 'italo', 'ítalo', 'iuri', 'jader', 'jair', 'janio', 'jayme',
  'jeferson', 'jefferson', 'joaquim', 'jonas', 'jonathan', 'jordan', 'juliano', 'kleber',
  'laerte', 'lauro', 'lazaro', 'lázaro', 'leo', 'léo', 'lorenzo', 'luan', 'lucca', 'luciano',
  'lucio', 'lúcio', 'manoel', 'manuel', 'marcel', 'marlon', 'matteo', 'max', 'moises',
  'moisés', 'natan', 'nathan', 'nelson', 'nicolas', 'nícolas', 'orlando', 'oscar', 'osvaldo',
  'otto', 'patrick', 'pedrinho', 'raí', 'rai', 'ramon', 'raphael', 'raul', 'reginaldo',
  'renan', 'renato', 'renzo', 'ricardo', 'roberto', 'robson', 'rodolfo', 'roger', 'rogério',
  'rogerio', 'romulo', 'rômulo', 'ronaldo', 'rubens', 'salvador', 'samir', 'saulo', 'sebastiao',
  'sebastião', 'silvio', 'sílvio', 'tales', 'thales', 'ulisses', 'vagner', 'valdir', 'vicente',
  'wagner', 'welinton', 'wellington', 'wesley', 'alessandro', 'alexandre', 'alexandro',
  'aloisio', 'aloísio', 'aluisio', 'amaro', 'amauri', 'américo', 'amilcar', 'amir', 'ananias',
  'anibal', 'aníbal', 'anselmo', 'antonio', 'antônio', 'apolonio', 'arildo', 'ariston',
  'armando', 'arnaldo', 'aroldo', 'arturo', 'ary', 'ari', 'ataíde', 'atila', 'átila', 'augusto',
  'aurelio', 'aurélio', 'baltazar', 'barnabé', 'bartolomeu', 'benedito', 'benjamim', 'benjamin',
  'bento', 'berlando', 'bernardo', 'beto', 'bruno', 'cacá', 'cacio', 'cássio', 'cassio',
  'celson', 'celso', 'cesar', 'césar', 'cicero', 'cícero', 'cirilo', 'ciro', 'claudinei',
  'claudio', 'cleber', 'clovest', 'clovis', 'clóvis', 'cristovao', 'cristóvão', 'damião',
  'daniel', 'danilo', 'dante', 'darcio', 'dárcio', 'dario', 'dário', 'david', 'decio', 'décio',
  'demetrio', 'demétrio', 'denilson', 'dirceu', 'djalma', 'domingos', 'donavan', 'dorival',
  'duarte', 'eder', 'éder', 'edgard', 'edgar', 'edilson', 'edmar', 'edmilson', 'edmundo',
  'edward', 'elcio', 'élcio', 'eliseu', 'eliton', 'elvis', 'emmanuel', 'enrique',
  'erivaldo', 'ernani', 'ernesto', 'estevão', 'estevao', 'eugênio', 'eugenio', 'eurico',
  'evaldo', 'evandro', 'evaristo', 'ezequiel', 'fabiano', 'fausto', 'felicio', 'felício',
  'felipe', 'felix', 'ferdinando', 'fernando', 'fidel', 'firmino', 'florentino',
  'floriano', 'fortunato', 'gentil', 'georgie', 'geraldo', 'germano', 'gerson',
  'giani', 'gil', 'gilmar', 'gilson', 'giuliano', 'glauco', 'gonçalo', 'goncalo',
  'gualter', 'guido', 'guilherme', 'guilhermino', 'hamilton', 'haroldo', 'heitor',
  'helder', 'hélio', 'helton', 'henrique', 'hercules', 'hércules', 'hermann', 'hermes',
  'hildemaro', 'humberto', 'iacov', 'ignacio', 'ignácio', 'inacio', 'inácio', 'isidoro',
  'ivair', 'ivaldo', 'jaci', 'jacob', 'jacó', 'jair', 'jairo', 'jamil', 'jandir', 'jarbas',
  'jason', 'jayme', 'jean', 'jeferson', 'jeronimo', 'jerônimo', 'jesse', 'jessé', 'joao',
  'joaquim', 'joel', 'jofre', 'johan', 'john', 'jonas', 'jonathan', 'jorge', 'jose', 'josue',
  'josué', 'joviano', 'juarez', 'jucelino', 'juda', 'judas', 'julian', 'juliano', 'julio',
  'jurandir', 'juvenal', 'karl', 'kleber', 'laércio', 'laercio', 'lael', 'laerte', 'lauro',
  'lázaro', 'leandro', 'leocadio', 'leon', 'leonardo', 'leonel', 'leônidas', 'leonidas',
  'leopold', 'leopoldo', 'lineu', 'lino', 'lisandro', 'livio', 'lívio', 'lorenzo', 'lourival',
  'lucas', 'luciano', 'lucio', 'lúcio', 'luigi', 'luis', 'luiz', 'luther', 'maciel', 'magno',
  'maicon', 'maycon', 'manasses', 'manoel', 'manuel', 'marcelo', 'marcio', 'márcio', 'marco',
  'marcos', 'marcus', 'marino', 'mario', 'mário', 'marlon', 'marte', 'martin', 'martim',
  'mateus', 'matheus', 'matias', 'matthias', 'mauricio', 'maurício', 'mauro', 'max', 'maxwell',
  'messias', 'mikael', 'mikhail', 'milton', 'moacir', 'moises', 'moisés', 'murilo', 'nadir',
  'narciso', 'natan', 'nathan', 'nelson', 'néstor', 'nestor', 'nicanor', 'nicolas', 'nícolas',
  'nicolau', 'nilo', 'nilson', 'nilton', 'nivaldo', 'noah', 'noe', 'noé', 'norberto', 'octavio',
  'octávio', 'odair', 'odemir', 'orlando', 'oscar', 'osmar', 'osvaldo', 'otavio', 'otávio',
  'otelo', 'othon', 'otto', 'ovidio', 'ovídio', 'pablo', 'paschoal', 'pascoal', 'patricio',
  'patrício', 'patrick', 'paulo', 'pedro', 'plinio', 'plínio', 'policarpo', 'rafael',
  'raí', 'raimundo', 'ralfe', 'ralph', 'ramiro', 'ramon', 'raoni', 'raphael', 'raul', 'reinaldo',
  'renan', 'renato', 'rene', 'renê', 'ricardo', 'richard', 'rivaldo', 'roberto', 'robson',
  'rodolfo', 'rodrigo', 'roger', 'rogerio', 'rogério', 'romario', 'romário', 'romeu',
  'romulo', 'rômulo', 'ronaldo', 'ronan', 'ronie', 'roni', 'roque', 'ruben', 'rúben', 'rubens',
  'rui', 'ruy', 'salvador', 'samir', 'samuel', 'saulo', 'savio', 'sávio', 'sebastiao', 'sebastião',
  'sergio', 'sérgio', 'sidnei', 'sydney', 'sidney', 'silas', 'silvano', 'silverio', 'silvério',
  'silvesto', 'silvestre', 'silvio', 'sílvio', 'simao', 'simão', 'tadeu', 'tales', 'tarcisio',
  'tarcísio', 'tassio', 'tássio', 'telo', 'teo', 'téo', 'teodoro', 'teófilo', 'thales', 'theo',
  'thiago', 'tiago', 'tito', 'tomas', 'tomás', 'tome', 'tomé', 'tulio', 'túlio', 'ubirajara',
  'ubiratan', 'ulisses', 'valdemar', 'valdir', 'valdo', 'valdomiro', 'valter', 'vanderlei',
  'vanderley', 'vicente', 'victor', 'vitor', 'vítor', 'vladimir', 'wagner', 'waldir', 'walter',
  'wanderley', 'wellington', 'wesley', 'william', 'wilson', 'yago', 'yuri', 'zenaide', 'zenon'
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function detectGenderByName(fullName: string): Gender {
  if (!fullName) return 'male';

  const clean = normalizeName(fullName);
  const parts = clean.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';

  if (!firstName) return 'male';

  // 1. Direct Set check
  if (FEMALE_NAMES.has(firstName)) return 'female';
  if (MALE_NAMES.has(firstName)) return 'male';

  // 2. Specific exception rules
  if (['luca', 'sasha', 'joshua', 'gua', 'borba', 'silva', 'garcia', 'souza', 'sousa'].includes(firstName)) {
    return 'male';
  }

  // 3. Common Portuguese suffix rules
  if (
    firstName.endsWith('a') ||
    firstName.endsWith('ele') ||
    firstName.endsWith('ella') ||
    firstName.endsWith('ina') ||
    firstName.endsWith('ana') ||
    firstName.endsWith('ia') ||
    firstName.endsWith('isa') ||
    firstName.endsWith('ise') ||
    firstName.endsWith('ice') ||
    firstName.endsWith('ette') ||
    firstName.endsWith('ine')
  ) {
    return 'female';
  }

  if (
    firstName.endsWith('o') ||
    firstName.endsWith('os') ||
    firstName.endsWith('or') ||
    firstName.endsWith('on') ||
    firstName.endsWith('el') ||
    firstName.endsWith('us') ||
    firstName.endsWith('ur') ||
    firstName.endsWith('an') ||
    firstName.endsWith('am') ||
    firstName.endsWith('em') ||
    firstName.endsWith('er') ||
    firstName.endsWith('io') ||
    firstName.endsWith('eu') ||
    firstName.endsWith('es') ||
    firstName.endsWith('is') ||
    firstName.endsWith('en') ||
    firstName.endsWith('ik')
  ) {
    return 'male';
  }

  return firstName.endsWith('a') ? 'female' : 'male';
}
