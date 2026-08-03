import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { semantic, radius } from '@cvip/ui';

/**
 * Tourist app primary navigation — PRD §5.
 *
 * Five tabs, in this order, with Irie AI as the CENTRE item (build prompt §16: "Irie AI is the
 * centre bottom-navigation item").
 *
 * The first mockup showed a four-tab VIP Cayman bar with no Irie AI; the later Caribbean VIP
 * mockups show exactly this five-tab arrangement with the gold Irie badge raised in the middle, so
 * the mockups and the PRD now agree and this is drawn to match them.
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
        // Gold in both states, as the mockups draw it: this is the product's hero action, and a
        // centre item that dims when unselected stops reading as one.
        backgroundColor: semantic.premium,
        borderWidth: 3,
        borderColor: semantic.navBackground,
        opacity: focused ? 1 : 0.92,
      }}
    >
      <Text style={{ fontSize: 22, color: semantic.brand }}>✦</Text>
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
