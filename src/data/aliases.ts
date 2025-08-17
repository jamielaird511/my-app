// Simple alias registry: everyday words -> canonical terms or code hints.
// Keep this list growing over time.
export type AliasEntry = {
  term: string;             // what users type ("hoodie")
  synonyms?: string[];      // near-equivalents ("hooded sweatshirt")
  hintPrefixes?: string[];  // optional HS prefixes to bias results (e.g., "6101", "6110")
  forceRefine?: boolean;   // marks inherently generic terms
};

export const ALIASES: AliasEntry[] = [
  { term: 'hoodie', synonyms: ['hooded sweatshirt', 'hooded jumper', 'hooded pullover'], hintPrefixes: ['6110', '6101'] },
  { term: 'sweatshirt', synonyms: ['jumper', 'pullover'], hintPrefixes: ['6110'] },
  { term: 'sweatpants', synonyms: ['track pants', 'joggers'], hintPrefixes: ['6103', '6104'] },
  { term: 'tshirt', synonyms: ['tee', 't-shirt'], hintPrefixes: ['6109'] },
  { term: 'sneakers', synonyms: ['tennis shoes', 'trainers', 'gym shoes'], hintPrefixes: ['6404'] },
  { term: 'yoga pants', synonyms: ['leggings'], hintPrefixes: ['6104'] },
  { term: 'backpack', synonyms: ['rucksack'], hintPrefixes: ['4202'] },
  { term: 'handbag', synonyms: ['purse'], hintPrefixes: ['4202'] },
  { term: 'laptop', synonyms: ['notebook computer', 'portable computer'], hintPrefixes: ['8471'] },
  { term: 'phone case', synonyms: ['mobile case', 'cellphone case'], hintPrefixes: ['4202', '3926'] },

  { term: 'shoes',
    synonyms: ['footwear', 'dress shoes', 'sports shoes', 'running shoes', 'casual shoes'],
    hintPrefixes: ['6401','6402','6403','6404','6405'],
    forceRefine: true
  },
  { term: 'clothes',
    synonyms: ['clothing', 'apparel', 'garments'],
    hintPrefixes: ['61','62'],
    forceRefine: true
  },
  { term: 'bags',
    synonyms: ['bag', 'handbags', 'purses', 'backpacks'],
    hintPrefixes: ['4202'],
    forceRefine: true
  },
  { term: 'electronics',
    synonyms: ['electronic devices', 'gadgets'],
    hintPrefixes: ['84','85'],
    forceRefine: true
  },
  { term: 'toys',
    synonyms: ['toy', 'games'],
    hintPrefixes: ['9503','9504'],
    forceRefine: true
  },
  { term: 'furniture',
    synonyms: ['chair', 'table', 'sofa'],
    hintPrefixes: ['94'],
    forceRefine: true
  },
  { term: 'parts',
    synonyms: ['spare parts','accessories'],
    hintPrefixes: ['84','85','87','90','94'],
    forceRefine: true
  },
  { term: 'charger',
    synonyms: ['power adapter'],
    hintPrefixes: ['8504','8536'],
    forceRefine: true
  },
  { term: 'cable',
    synonyms: ['wire','cord'],
    hintPrefixes: ['8544'],
    forceRefine: true
  },
  { term: 'case',
    synonyms: ['cover','protective case'],
    hintPrefixes: ['4202','3926'],
    forceRefine: true
  },
  { term: 'device',
    synonyms: ['unit','product'],
    hintPrefixes: ['84','85','90'],
    forceRefine: true
  }
];
