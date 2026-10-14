import { Image } from "expo-image";

type LogoMarkProps = {
  size: number;
  color: string;
};

// The app's paw-check mark (docs/design/icon/splash-icon.svg), recoloured
// with tintColor so it can sit on any background.
export function LogoMark({ size, color }: LogoMarkProps) {
  return (
    <Image
      source={require("@/assets/images/splash-icon.png")}
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={color}
      accessible={false}
    />
  );
}
