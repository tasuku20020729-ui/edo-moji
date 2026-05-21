import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";

import {
  ref,
  uploadString,
  getDownloadURL,
} from "firebase/storage";

import { db, storage } from "./firebase";

import type {
  CharacterSample,
  RadicalPartSample,
} from "../types/character";

function safeChar(char: string) {
  return encodeURIComponent(char);
}

function makePath(type: string, char: string) {
  return `${type}/${safeChar(char)}/${crypto.randomUUID()}.png`;
}

export async function uploadDataUrl(dataUrl: string, path: string) {
  const storageRef = ref(storage, path);
  await uploadString(storageRef, dataUrl, "data_url");
  return getDownloadURL(storageRef);
}

export async function saveCharacterSampleToFirebase(
  sample: CharacterSample,
  radicalParts: Omit<RadicalPartSample, "id" | "parentSampleId" | "createdAt">[]
) {
  const rawImageUrl = await uploadDataUrl(
    sample.rawImageUrl,
    makePath("raw", sample.char)
  );

  const processedImageUrl = await uploadDataUrl(
    sample.imageUrl,
    makePath("processed", sample.char)
  );

  const sampleRef = await addDoc(collection(db, "characterSamples"), {
    char: sample.char,
    name: sample.name,
    rawImageUrl,
    imageUrl: processedImageUrl,
    skeletonUrl: processedImageUrl,
    styleAnalysis: sample.styleAnalysis,
    binarizeParams: sample.binarizeParams,
    radicals: sample.radicals,
    layout: sample.layout,
    bbox: sample.bbox,
    center: sample.center,
    margins: sample.margins,
    blackRatio: sample.blackRatio,
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db);

  for (const part of radicalParts) {
    const partImageUrl = await uploadDataUrl(
      part.imageUrl,
      makePath("radicalParts", part.radical)
    );

    const partRef = doc(collection(db, "radicalParts"));

    batch.set(partRef, {
      parentSampleId: sampleRef.id,
      parentChar: sample.char,
      radical: part.radical,
      radicalIndex: part.radicalIndex,
      totalRadicals: part.totalRadicals,
      layout: part.layout,
      imageUrl: partImageUrl,
      rawImageUrl,
      styleAnalysis: part.styleAnalysis,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return sampleRef.id;
}