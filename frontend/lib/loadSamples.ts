import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

import { db } from "./firebase";

import type {
  CharacterSample,
  RadicalPartSample,
} from "../types/character";

export async function loadSamplesFromFirebase() {
  const q = query(
    collection(db, "characterSamples"),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      char: data.char,
      name: data.name || "",
      rawImageUrl: data.rawImageUrl,
      imageUrl: data.imageUrl,
      skeletonUrl: data.skeletonUrl || data.imageUrl,
      styleAnalysis: data.styleAnalysis,
      binarizeParams: data.binarizeParams,
      radicals: data.radicals || [],
      layout: data.layout || "single",
      bbox: data.bbox || { x: 0, y: 0, width: 1, height: 1 },
      center: data.center || { x: 0.5, y: 0.5 },
      margins: data.margins || {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      blackRatio: data.blackRatio || 0,
    } as CharacterSample;
  });
}

export async function loadRadicalPartsFromFirebase() {
  const q = query(
    collection(db, "radicalParts"),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      parentSampleId: data.parentSampleId,
      parentChar: data.parentChar,
      radical: data.radical,
      radicalIndex: data.radicalIndex,
      totalRadicals: data.totalRadicals,
      layout: data.layout,
      imageUrl: data.imageUrl,
      rawImageUrl: data.rawImageUrl,
      styleAnalysis: data.styleAnalysis,
    } as RadicalPartSample;
  });
}