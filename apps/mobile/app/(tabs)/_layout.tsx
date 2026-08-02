import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { semantic, radius } from '@cvip/ui';

/**
 * Tourist app primary navigation — PRD §5.
 *
 * Five tabs, in this order, with Irie AI as the CENTRE item (build prompt §16: "Irie AI is the
 * centre bottom-navigation item"). The supplied mockup shows a different four-tab arrangement;
 * per the founder it is a colour reference only, so the PRD ordering governs here.
 */

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 18,
        opacity: focused ? 1 : 0.65,
        color: focused ? semantic.navActive : semantic.navInactive,
      }}
    >
      {label}
    </Text>
  );
}

/** The centre item is visually raised so Irie AI reads as the hero action. */
function IrieIcon({ focused }: { focused: boolean }) {
  return (
    <View
      style={{
        width: 52,
        height: 52,
        marginTop: -18,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? semantic.premium : semantic.brandActive,
        borderWidth: 2,
        borderColor: semantic.navBackground,
      }}
    >
      <Text style={{ fontSize: 20 }}>✦</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: semantic.brand },
        headerTintColor: semantic.textOnDark,
        tabBarStyle: {
          backgroundColor: semantic.navBackground,
          borderTopWidth: 0,
          height: 68,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: semantic.navActive,
        tabBarInactiveTintColor: semantic.navInactive,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon label="◎" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon label="◈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="irie"
        options={{
          title: 'Irie AI',
          tabBarIcon: ({ focused }: { focused: boolean }) => <IrieIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon label="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon label="◯" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
