import { Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { elevation, palette, radius, semantic, typography } from '@cvip/ui';
import { Icon, IrieStars, type IconName } from '../../components/kit';

/**
 * Tourist app primary navigation — PRD §5.
 *
 * Five tabs, in this order, with Irie AI as the CENTRE item (build prompt §16: "Irie AI is the
 * centre bottom-navigation item"). HANDOVER §4 records the resolution: the VIP Cayman mockup shows
 * four tabs, the later Caribbean VIP mockups show these five, and the five win.
 *
 * The bar itself is drawn from the mockups and this is where it was most wrong. It was a deep green
 * slab, and in both mockups the bar is **ivory** — the same colour as the screen above it, separated
 * only by a hairline, with thin outline icons in ink and a small letterspaced label beneath. Putting
 * the darkest value in the design along the bottom edge of every screen is what made the app read as
 * a different product from the mockup, before any other difference was even visible.
 */

function TabItem({
  icon,
  label,
  focused,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 72, paddingTop: 2 }}>
      {/* The selected tab's icon sits in a filled green disc with a gold hairline ring, as the
          mockup draws it. Colour alone was carrying the selected state before, and at this size a
          deep-green icon beside a grey one is a difference you have to look for. */}
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? palette.green900 : 'transparent',
          borderWidth: focused ? 1.5 : 0,
          borderColor: palette.goldLight,
        }}
      >
        <Icon name={icon} size={17} color={focused ? semantic.textOnDark : semantic.navInactive} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          ...typography.overline,
          fontSize: 10,
          letterSpacing: 0.2,
          fontFamily: focused ? typography.bodyStrong.fontFamily : typography.captionStrong.fontFamily,
          color: focused ? semantic.accent : semantic.navInactive,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The centre item: a deep green disc, gold-ringed, holding Irie's gold stars with the label in gold
 * *inside* the circle.
 *
 * This was built inverted — a gold disc with a single green sparkle and an ink label underneath —
 * which threw away the motif the concierge is recognised by. In the mockup Irie is always gold on
 * green, and the badge is the anchor for that: it is the one piece of the design a guest sees on
 * every screen of the journey.
 *
 * Gold in both states, because a centre item that dims when unselected stops reading as the
 * product's hero action.
 */
function IrieBadge({ focused }: { focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', width: 72 }}>
      <View
        style={{
          width: 58,
          height: 58,
          marginTop: -20,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          backgroundColor: palette.green900,
          borderWidth: 2,
          borderColor: palette.goldLight,
          opacity: focused ? 1 : 0.94,
          ...elevation.raised,
        }}
      >
        <IrieStars size={24} />
        <Text
          numberOfLines={1}
          style={{
            ...typography.overline,
            fontSize: 9,
            letterSpacing: 0.3,
            color: palette.goldTop,
          }}
        >
          Irie AI
        </Text>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // Screens draw their own titles in the mockup's type, so the stock header is off
        // everywhere rather than being restyled into something that only nearly matches.
        headerShown: false,
        tabBarStyle: {
          backgroundColor: semantic.navBackground,
          borderTopWidth: 1,
          borderTopColor: semantic.navBorder,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          elevation: 0,
          shadowOpacity: 0,
        },
        // The label lives inside the icon component so it can sit at the mockup's size and
        // letterspacing; the stock label would render a second one underneath.
        tabBarShowLabel: false,
        tabBarActiveTintColor: semantic.navActive,
        tabBarInactiveTintColor: semantic.navInactive,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabItem icon="search" label="Explore" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabItem icon="map-pin" label="Nearby" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="irie"
        options={{
          title: 'Irie AI',
          tabBarIcon: ({ focused }: { focused: boolean }) => <IrieBadge focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabItem icon="calendar" label="My Trips" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabItem icon="user" label="Account" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
