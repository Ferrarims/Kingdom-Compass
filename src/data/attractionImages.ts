// Curated high quality imagery mapping for Orlando parks, attractions, and restaurants

export interface ItemMedia {
  title: string;
  imageUrl: string;
  fallbackKeywords: string;
  category: 'park' | 'attraction' | 'restaurant';
  parkName?: string;
  description?: string;
}

export const PARK_COVER_IMAGES: Record<string, string> = {
  'Magic Kingdom': 'https://images.unsplash.com/photo-1575089976121-8ed7b2a54265?auto=format&fit=crop&w=1200&q=80',
  'EPCOT': 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1200&q=80',
  "Disney's Hollywood Studios": 'https://images.unsplash.com/photo-1597466599360-3b9775841aec?auto=format&fit=crop&w=1200&q=80',
  "Disney's Animal Kingdom": 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
  "Disney's Typhoon Lagoon Water Park": 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  "Disney's Blizzard Beach Water Park": 'https://images.unsplash.com/photo-1582650625119-3a31f8fa2699?auto=format&fit=crop&w=1200&q=80',
  'Universal Studios Florida': 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80',
  "Universal's Islands of Adventure": 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1200&q=80',
  'Universal Epic Universe': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
  "Universal's Volcano Bay": 'https://images.unsplash.com/photo-1582650625119-3a31f8fa2699?auto=format&fit=crop&w=1200&q=80',
  'SeaWorld Orlando': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80',
  'Busch Gardens Tampa Bay': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1200&q=80',
  'Aquatica Orlando': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  'Discovery Cove': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80',
  'Kennedy Space Center Visitor Complex': 'https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=1200&q=80',
  'LEGOLAND Florida Resort': 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?auto=format&fit=crop&w=1200&q=80',
  'Gatorland Orlando': 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=1200&q=80'
};

export const ATTRACTION_IMAGES_MAP: Record<string, string> = {
  // Magic Kingdom
  'TRON Lightcycle / Run': 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80', // Futuristic blue glowing canopy & track speed
  'Seven Dwarfs Mine Train': 'https://images.unsplash.com/photo-1541447271487-09612b3f49f7?auto=format&fit=crop&w=800&q=80', // Mine train Coaster mountain landscape
  'Space Mountain': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80', // Deep space cosmos theme
  'Big Thunder Mountain Railroad': 'https://images.unsplash.com/photo-1541447271487-09612b3f49f7?auto=format&fit=crop&w=800&q=80', // Red rock canyon mine train
  'Haunted Mansion': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=800&q=80', // Gothic haunted mansion estate
  'Pirates of the Caribbean': 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=800&q=80', // Pirate galleon ship
  "Peter Pan's Flight": 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80', // Magical flight over starry night city

  // EPCOT
  'Guardians of the Galaxy: Cosmic Rewind': 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=80', // Cosmic galaxy nebula launch
  'Remy\'s Ratatouille Adventure': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80', // Parisian street & kitchen theme
  'Frozen Ever After': 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=800&q=80', // Enchanted ice kingdom aurora
  'Soarin\' Around the World': 'https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&w=800&q=80', // Panoramic aerial flight over landscapes
  'Test Track': 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80', // Futuristic sports car speed track
  'Spaceship Earth': 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80', // Iconic EPCOT geodesic sphere ball

  // Hollywood Studios
  'Star Wars: Rise of the Resistance': 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80', // Star Destroyer hangar sci-fi corridor
  'Millennium Falcon: Smugglers Run': 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80', // Sci-fi starship cockpit controls
  'Slinky Dog Dash': 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?auto=format&fit=crop&w=800&q=80', // Playful colorful toy coaster
  'The Twilight Zone Tower of Terror': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=800&q=80', // Haunted Hollywood tower hotel
  'Rock \'n\' Roller Coaster starring Aerosmith': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80', // Rock stage electric guitar coaster
  'Mickey & Minnie\'s Runaway Railway': 'https://images.unsplash.com/photo-1575089976121-8ed7b2a54265?auto=format&fit=crop&w=800&q=80', // Vintage Disney cartoon cinema

  // Animal Kingdom
  'Avatar Flight of Passage': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80', // Bioluminescent Pandora alien jungle
  'Na\'vi River Journey': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', // Glowing bioluminescent river boat
  'Expedition Everest - Legend of the Forbidden Mountain': 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80', // Himalayan snow mountain coaster
  'Kilimanjaro Safaris': 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=800&q=80', // African savanna wildlife safari
  'Festival of the Lion King': 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80', // Lion King theatrical show

  // Universal Studios
  'Harry Potter and the Escape from Gringotts': 'https://images.unsplash.com/photo-1547756536-cde3673fa2e5?auto=format&fit=crop&w=800&q=80', // Gringotts bank & Diagon Alley dragon
  'Revenge of the Mummy': 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=800&q=80', // Egyptian tomb mummy Coaster
  'TRANSFORMERS: The Ride-3D': 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80', // Cybernetic robot battle city skyline
  'Men in Black Alien Attack': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80', // Sci-fi alien defense blaster arena
  'Despicable Me Minion Mayhem': 'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?auto=format&fit=crop&w=800&q=80', // Minion yellow theme park laboratory

  // Islands of Adventure
  'Hagrid\'s Magical Creatures Motorbike Adventure': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // Motorbike Coaster speeding through forest
  'Jurassic World VelociCoaster': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // High-speed steel raptor paddock coaster
  'The Incredible Hulk Coaster': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // Green gamma launch steel coaster
  'The Amazing Adventures of Spider-Man': 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80', // Comic superhero city skyline
  'Jurassic Park River Adventure': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', // Dinosaur jungle river splash down
  'Hogwarts Express': 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=800&q=80', // Vintage steam train Hogwarts Express

  // SeaWorld & Busch Gardens
  'Mako': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // Ocean hypercoaster steel track
  'Kraken': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // Floorless looping rollercoaster
  'Iron Gwazi': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // Hybrid wooden-steel coaster drop
  'SheiKra': 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80', // 90-degree dive coaster drop

  // NASA Space Center
  'Space Shuttle Atlantis': 'https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=800&q=80', // Real NASA space shuttle orbiter
  'Shuttle Launch Experience': 'https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=800&q=80', // Rocket launch gantry Kennedy Space Center
  'Saturn V Rocket Garden': 'https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=800&q=80', // Saturn V rocket garden standing tall
};

export const RESTAURANT_IMAGES_MAP: Record<string, string> = {
  'Be Our Guest Restaurant': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
  'Cinderella\'s Royal Table': 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
  'Space 220': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
  'San Angel Inn Restaurante': 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
  'Via Napoli': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
  'Sci-Fi Dine-In Theater': 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80',
  'Oga\'s Cantina': 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80',
  'Satu\'li Canteen': 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=800&q=80',
  'Yak & Yeti Restaurant': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
  'Mythos Restaurant': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
  'Three Broomsticks': 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
  'Leaky Cauldron': 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80',
};

// Generic thematic default fallbacks if exact name is not matched
export const DEFAULT_THEME_FALLBACKS: Record<string, string> = {
  park: 'https://images.unsplash.com/photo-1575089976121-8ed7b2a54265?auto=format&fit=crop&w=800&q=80',
  attraction: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80',
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
};

export function getAttractionImage(title: string, parkName?: string): string {
  const cleanTitle = title.replace(/\(.*?\)/g, '').trim();
  if (ATTRACTION_IMAGES_MAP[cleanTitle]) {
    return ATTRACTION_IMAGES_MAP[cleanTitle];
  }
  for (const [key, url] of Object.entries(ATTRACTION_IMAGES_MAP)) {
    if (cleanTitle.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cleanTitle.toLowerCase())) {
      return url;
    }
  }
  if (parkName && PARK_COVER_IMAGES[parkName]) {
    return PARK_COVER_IMAGES[parkName];
  }
  return DEFAULT_THEME_FALLBACKS.attraction;
}

export function getRestaurantImage(title: string, parkName?: string): string {
  const cleanTitle = title.replace(/\(.*?\)/g, '').trim();
  if (RESTAURANT_IMAGES_MAP[cleanTitle]) {
    return RESTAURANT_IMAGES_MAP[cleanTitle];
  }
  for (const [key, url] of Object.entries(RESTAURANT_IMAGES_MAP)) {
    if (cleanTitle.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cleanTitle.toLowerCase())) {
      return url;
    }
  }
  if (parkName && PARK_COVER_IMAGES[parkName]) {
    return PARK_COVER_IMAGES[parkName];
  }
  return DEFAULT_THEME_FALLBACKS.restaurant;
}

export function getParkCoverImage(parkName: string): string {
  if (PARK_COVER_IMAGES[parkName]) {
    return PARK_COVER_IMAGES[parkName];
  }
  for (const [key, url] of Object.entries(PARK_COVER_IMAGES)) {
    if (parkName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(parkName.toLowerCase())) {
      return url;
    }
  }
  return DEFAULT_THEME_FALLBACKS.park;
}

export function getGoogleImagesSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query + ' Orlando Florida')}`;
}

export function getYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' POV Orlando')}`;
}
