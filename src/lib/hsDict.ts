// src/lib/hsDict.ts

export const hsDict: Record<string, { code: string; description: string }> = {
  // Apparel
  't-shirt': { code: '610910', description: 'T-shirts of cotton, knitted or crocheted' },
  shirt: { code: '620520', description: "Men's or boys' shirts of cotton, not knitted" },
  dress: { code: '620442', description: "Women's or girls' dresses of cotton" },
  jeans: { code: '620342', description: "Men's or boys' trousers of cotton" },
  jacket: {
    code: '620193',
    description: "Men's or boys' anoraks, windcheaters of man-made fibres",
  },

  // Footwear
  shoes: { code: '640419', description: 'Footwear with outer soles of rubber or plastics' },
  sneakers: {
    code: '640411',
    description: 'Sports footwear with outer soles of rubber or plastics',
  },
  boots: { code: '640391', description: 'Footwear covering the ankle, leather uppers' },
  sandals: { code: '640319', description: 'Footwear with leather uppers, not covering the ankle' },

  // Electronics
  laptop: { code: '847130', description: 'Portable digital automatic data processing machines' },
  'mobile phone': {
    code: '851712',
    description: 'Telephones for cellular networks or for other wireless networks',
  },
  headphones: {
    code: '851830',
    description: 'Headphones and earphones, whether or not with microphone',
  },
  television: { code: '852872', description: 'Reception apparatus for television' },

  // Bags & accessories
  handbag: { code: '420221', description: 'Handbags with outer surface of leather' },
  backpack: { code: '420292', description: 'Backpacks with outer surface of textile materials' },
  wallet: { code: '420231', description: 'Wallets and purses with outer surface of leather' },
  belt: { code: '420330', description: 'Belts of leather or composition leather' },

  // Kitchenware & home
  'ceramic plate': {
    code: '691110',
    description: 'Tableware and kitchenware of porcelain or china',
  },
  knife: { code: '821192', description: 'Knives with fixed blades' },
  fork: { code: '821191', description: 'Table forks' },
  spoon: { code: '821599', description: 'Other spoons' },
  'glass cup': { code: '701337', description: 'Drinking glasses of glass' },

  // --- Sporting goods / fitness ---
  'yoga mat': {
    code: '950691',
    description:
      'Articles and equipment for general physical exercise, gymnastics or athletics (incl. mats)',
  },
  'yoga block': { code: '950691', description: 'Blocks for yoga and pilates training' },
  'yoga strap': { code: '950691', description: 'Straps/belts for yoga and stretching' },
  'yoga wheel': { code: '950691', description: 'Wheels for yoga flexibility training' },
  kettlebell: {
    code: '950691',
    description:
      'Articles and equipment for general physical exercise (weights, kettlebells, etc.)',
  },
  dumbbell: {
    code: '950691',
    description: 'Weights / dumbbells; equipment for general physical exercise',
  },
  barbell: { code: '950691', description: 'Barbells and weight plates for strength training' },
  'weight plate': {
    code: '950691',
    description: 'Plates used with barbells or machines for strength training',
  },
  'resistance band': {
    code: '950691',
    description: 'Elastic exercise bands for strength and flexibility',
  },
  'pull up bar': { code: '950691', description: 'Bars for pull-ups and upper body training' },
  'push up bar': { code: '950691', description: 'Push-up handles/bars for floor exercises' },
  'jump rope': { code: '950691', description: 'Skipping ropes for fitness training' },
  'foam roller': {
    code: '950691',
    description: 'Foam rollers for self-myofascial release and massage',
  },
  'medicine ball': {
    code: '950691',
    description: 'Weighted balls for exercise and rehabilitation',
  },
  'slam ball': { code: '950691', description: 'Balls designed for slamming exercises' },
  'exercise ball': { code: '950691', description: 'Stability / Swiss balls for exercise' },
  'ab roller': { code: '950691', description: 'Abdominal exercise wheels' },
  'gym mat': { code: '950691', description: 'Mats for floor-based exercise and stretching' },
  'speed ladder': { code: '950691', description: 'Agility ladders for sports training' },
  'balance board': { code: '950691', description: 'Boards for balance and core training' },
  'plyo box': { code: '950691', description: 'Plyometric jump boxes' },

  // Tools
  hammer: { code: '820520', description: 'Hammers and sledge hammers' },
  screwdriver: { code: '820540', description: 'Screwdrivers' },
  wrench: { code: '820411', description: 'Spanners and wrenches, hand-operated' },

  // Toys
  doll: { code: '950300', description: 'Dolls representing only human beings' },
  'toy car': {
    code: '950300',
    description: 'Other toys representing animals or non-human creatures',
  },
  'board game': { code: '950490', description: 'Articles for arcade, table or parlor games' },

  // Jewellery
  necklace: { code: '711311', description: 'Articles of jewellery of silver' },
  ring: { code: '711319', description: 'Articles of jewellery of other precious metal' },
  bracelet: { code: '711311', description: 'Articles of jewellery of silver' },

  // Optical / eyewear
  sunglasses: { code: '900410', description: 'Sunglasses' },
};

export const hsAliases: Record<string, string> = {
  // Apparel
  tshirts: 't-shirt',
  tee: 't-shirt',
  tees: 't-shirt',
  shirts: 'shirt',
  dresses: 'dress',
  pants: 'jeans',
  trousers: 'jeans',
  jackets: 'jacket',

  // Footwear
  trainers: 'sneakers',
  runners: 'sneakers',
  boots: 'boots',
  sandals: 'sandals',

  // Electronics
  notebook: 'laptop',
  computer: 'laptop',
  phone: 'mobile phone',
  cellphone: 'mobile phone',
  earphones: 'headphones',
  tv: 'television',

  // Bags & accessories
  bag: 'handbag',
  purse: 'handbag',
  rucksack: 'backpack',
  belt: 'belt',

  // Kitchenware & home
  plate: 'ceramic plate',
  cup: 'glass cup',
  mug: 'glass cup',

  // Sporting goods plurals and variations
  'yoga mats': 'yoga mat',
  'yoga blocks': 'yoga block',
  'yoga straps': 'yoga strap',
  'yoga wheels': 'yoga wheel',
  kettlebells: 'kettlebell',
  dumbbells: 'dumbbell',
  barbells: 'barbell',
  'weight plates': 'weight plate',
  'resistance bands': 'resistance band',
  'pull up bars': 'pull up bar',
  'push up bars': 'push up bar',
  'jump ropes': 'jump rope',
  'foam rollers': 'foam roller',
  'medicine balls': 'medicine ball',
  'slam balls': 'slam ball',
  'exercise balls': 'exercise ball',
  'ab rollers': 'ab roller',
  'gym mats': 'gym mat',
  'speed ladders': 'speed ladder',
  'balance boards': 'balance board',
  'plyo boxes': 'plyo box',

  // Toys
  toy: 'doll',
  cars: 'toy car',
  game: 'board game',

  // Jewellery
  chain: 'necklace',
  rings: 'ring',
  bangle: 'bracelet',

  // Optical / eyewear
  sunglass: 'sunglasses',
  shades: 'sunglasses',
};
